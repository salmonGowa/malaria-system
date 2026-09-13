"""Compartmental (SEIR) forecasting benchmark — solved with scipy, driven by
observed rainfall, calibrated per county against its own case history.

This is a SEPARATE module from app/simulation.py: that one is the
interactive, user-parameter-driven "what if" explorer behind the dashboard's
Simulations page (illustrative only, not fit to any data — see its own
docstring; nothing here changes it or what it's used for). This module
exists to satisfy the proposal's Task 4 / Objective 2 requirement — a
compartmental baseline to benchmark the trained ML model against — and isn't
wired to any interactive endpoint.

Model: human-only SEIR (no explicit mosquito compartment — docs/architecture.md
documents this as the simpler of two acceptable options given the project's
scope) with a rainfall-modulated transmission rate:

    beta(t) = beta0 * (1 + k * log1p(rain(t - lag) / 40))

capturing the standard vector-borne mechanism — more rainfall now means more
mosquito breeding habitat and higher effective transmission ~1 month later —
without a separate vector sub-model. sigma (incubation) and gamma (infectious
period) are fixed at the same literature-typical values app/simulation.py
already uses; beta0 (baseline transmission), k (rainfall sensitivity), and a
reporting-fraction scale (true new infections -> confirmed reported cases,
standard practice for relating a mechanistic model's output to surveillance
counts) are calibrated per county via least-squares against that county's own
historical monthly case counts.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import least_squares

SIGMA = 1.0 / 10.0  # per day — ~10 day incubation, matches app/simulation.py's default
GAMMA = 1.0 / 14.0  # per day — ~14 day infectious period, matches app/simulation.py's default
DAYS_PER_MONTH = 30.0
RAINFALL_SCALE_MM = 40.0  # same "typical monthly rainfall" scale used by the synthetic case generator


@dataclass
class SEIRParams:
    beta0: float
    k: float
    reporting_fraction: float

    def as_tuple(self):
        return (self.beta0, self.k, self.reporting_fraction)


def rainfall_response(rain_mm):
    """Diminishing-returns transmission response to rainfall — matches the
    functional form used in data/scripts/generate_synthetic_case_history.py
    (same modelling assumption: more rain helps, with diminishing effect)."""
    return math.log1p(max(rain_mm, 0.0) / RAINFALL_SCALE_MM)


def _simulate_months(params: SEIRParams, initial_state, rainfall_sequence):
    """Advance the SEIR system one month at a time, one solve_ivp call per
    month so beta can change between months as rainfall changes. Returns
    (monthly_reported_cases: list[float], final_state: tuple).

    A 5th state variable C accumulates new E->I transitions (`sigma * E`)
    over each month and is reset to 0 at the start of every month — that
    accumulated flow, not an endpoint compartment value, is "new cases this
    month".
    """
    S, E, I, R = initial_state
    monthly_reported = []

    for rain in rainfall_sequence:
        N = S + E + I + R
        beta = params.beta0 * (1.0 + params.k * rainfall_response(rain))

        def rhs(t, y, beta=beta, N=N):
            s, e, i, r, _c = y
            new_infections = beta * s * i / N if N > 0 else 0.0
            new_infectious = SIGMA * e
            recoveries = GAMMA * i
            return [-new_infections, new_infections - new_infectious, new_infectious - recoveries, recoveries, new_infectious]

        sol = solve_ivp(rhs, (0.0, DAYS_PER_MONTH), [S, E, I, R, 0.0], max_step=1.0)
        S, E, I, R, C = sol.y[:, -1]
        S, E, I, R = (max(v, 0.0) for v in (S, E, I, R))
        monthly_reported.append(params.reporting_fraction * max(C, 0.0))

    return monthly_reported, (S, E, I, R)


def initial_state_for(population, initial_infectious_frac=1e-4):
    """The (S, E, I, R) starting split `fit_county`/`forecast` use by default
    — exposed so a caller that wants to replay a fit over its own window
    (e.g. app/upload_simulation.py, to show "how well does this fit the data
    I gave it") starts from the exact same state the calibration did,
    instead of guessing at it."""
    i0 = max(initial_infectious_frac * population, 1.0)
    return (population - i0, 0.0, i0, 0.0)


def simulate_series(params: SEIRParams, initial_state, rainfall_sequence):
    """Public entry point for replaying an already-fit model over a rainfall
    sequence — a thin, documented wrapper around _simulate_months for
    callers outside this module (internal callers below use the private
    function directly, which is fine, they're in on the contract)."""
    monthly_reported, _ = _simulate_months(params, initial_state, rainfall_sequence)
    return monthly_reported


def fit_county(population, rainfall_sequence, observed_cases, initial_infectious_frac=1e-4):
    """Calibrate (beta0, k, reporting_fraction) by least-squares against one
    county's TRAINING-window rainfall/case series only.

    `rainfall_sequence[i]` must already be the rainfall value that drives
    month i's transmission (i.e. the caller has applied the 1-month lag) —
    this function just simulates and fits, it doesn't know about lags.
    """
    if len(rainfall_sequence) != len(observed_cases):
        raise ValueError("rainfall_sequence and observed_cases must be the same length")
    if len(observed_cases) < 4:
        raise ValueError("Need at least 4 months of training data to calibrate a 3-parameter SEIR fit")

    n = population
    initial_state = initial_state_for(n, initial_infectious_frac)
    observed = np.asarray(observed_cases, dtype=float)

    def residuals(x):
        params = SEIRParams(*x)
        simulated, _ = _simulate_months(params, initial_state, rainfall_sequence)
        return np.asarray(simulated) - observed

    x0 = [0.3, 1.0, 0.02]
    bounds = ([1e-4, 0.0, 1e-6], [3.0, 15.0, 1.0])
    result = least_squares(residuals, x0, bounds=bounds, max_nfev=300)
    return SEIRParams(*result.x)


def forecast(params: SEIRParams, population, rainfall_sequence, recent_cases_for_warmup, initial_infectious_frac=1e-4):
    """Simulate forward len(rainfall_sequence) months using already-fit
    `params`, warm-starting the S/E/I/R split from `recent_cases_for_warmup`
    (recent observed monthly cases, used only to set a plausible initial
    infectious compartment size — the same starting assumption `fit_county`
    used, scaled by recent case level relative to the training mean so a
    currently-elevated county doesn't start from a naive baseline).

    Returns monthly_reported_cases: list[float], one entry per element of
    rainfall_sequence.
    """
    n = population
    recent = [c for c in recent_cases_for_warmup if c is not None]
    warm_factor = 1.0
    if recent and params.reporting_fraction > 0:
        recent_mean = sum(recent) / len(recent)
        implied_infectious = recent_mean / max(params.reporting_fraction * SIGMA * DAYS_PER_MONTH, 1e-9)
        warm_factor = max(implied_infectious / max(n * initial_infectious_frac, 1.0), 0.1)
        warm_factor = min(warm_factor, 50.0)  # guard against a runaway warm start on a noisy month

    i0 = max(initial_infectious_frac * n * warm_factor, 1.0)
    i0 = min(i0, n * 0.2)  # can't start with more than 20% of the population already infectious
    initial_state = (n - i0, 0.0, i0, 0.0)

    monthly_reported, _ = _simulate_months(params, initial_state, rainfall_sequence)
    return monthly_reported
