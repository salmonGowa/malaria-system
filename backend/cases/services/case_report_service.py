from rest_framework.exceptions import ValidationError

from ..models import CaseReport


class CaseReportService:
    """Business logic for case reports.

    CaseReport is append-only and hash-chained (see CaseReport.save/delete) — this
    is the one resource in the app with real domain rules, which is why it gets a
    bespoke service instead of the shared ReadOnlyService base.
    """

    def get_queryset(self):
        # prefetch_related("superseded_by"): CaseReportSerializer.get_superseded_by_id
        # reads this reverse relation for every row in a list response —
        # without prefetching that's one extra query per report.
        return CaseReport.objects.select_related("county", "facility", "reported_by").prefetch_related(
            "superseded_by"
        )

    def create_report(self, *, validated_data, reported_by):
        """Create a new report. `reported_by` comes from the requesting user, not
        the request body — the controller is responsible for supplying it.

        `supersedes` is how a correction is filed (the model is append-only,
        so a mistaken report is never edited or deleted — a corrected report
        is submitted that points at the one it replaces; see CaseReport's
        docstring). Two domain rules keep that mechanism coherent:

        - You can only supersede the *current* version of a report. If the
          target has already been superseded, the correction must be filed
          against whichever report superseded it instead — otherwise two
          corrections could fork off the same original and it would be
          ambiguous which one is "current".
        - A correction must be for the same county, facility, and reporting
          period as what it supersedes — that's what makes it a correction
          of that report rather than an unrelated new one that happens to
          reference it.
        """
        supersedes = validated_data.get("supersedes")
        if supersedes is not None:
            if supersedes.superseded_by.exists():
                current = supersedes.superseded_by.order_by("-id").first()
                raise ValidationError(
                    {
                        "supersedes": (
                            f"Report #{supersedes.id} has already been corrected by report #{current.id}. "
                            f"Correct #{current.id} instead — only the current version of a report can be superseded."
                        )
                    }
                )
            mismatches = []
            if validated_data.get("county") != supersedes.county:
                mismatches.append("county")
            if validated_data.get("facility") != supersedes.facility:
                mismatches.append("facility")
            if validated_data.get("report_date") != supersedes.report_date:
                mismatches.append("report_date")
            if mismatches:
                raise ValidationError(
                    {
                        "supersedes": (
                            f"A correction must match the report it supersedes on {', '.join(mismatches)} "
                            f"— report #{supersedes.id} does not. Submit a new, unrelated report instead if "
                            "this is a different county, facility, or reporting period."
                        )
                    }
                )

        return CaseReport.objects.create(reported_by=reported_by, **validated_data)

    def verify_chain(self):
        """Walk the *whole* chain from the first record forward — never
        stopping at the first failure — confirming for every record (a) its
        stored hash matches its own recomputed content
        (CaseReport.verify_chain_link — catches an edited record) and (b)
        its previous_hash matches the prior record's *stored* record_hash
        (catches a deleted/reordered/inserted record). Either check failing
        means that record has been tampered with — this is CaseReport's
        whole reason for existing (see docs/architecture.md's "Why
        CaseReport is hash-chained").

        Continuing past the first failure (rather than returning early) is
        deliberate: editing a record's content via a raw SQL UPDATE changes
        only that row's content, not its stored record_hash column, so
        every record *after* it still links correctly (their previous_hash
        still matches the tampered record's unchanged stored hash) even
        though that one record's own content no longer matches its hash. A
        per-record breakdown makes that visible — self_valid catches the
        tampered record immediately and independently of whether anything
        downstream "notices" — which a single first-failure summary can't
        show. `frontend/src/pages/ChainIntegrity.tsx` renders this as a
        clickable, node-by-node chain visualization.
        """
        expected_previous_hash = ""
        records = []
        first_failure = None

        for record in CaseReport.objects.order_by("id"):
            self_valid = record.verify_chain_link()
            link_valid = record.previous_hash == expected_previous_hash
            record_valid = self_valid and link_valid

            if not record_valid and first_failure is None:
                if not self_valid:
                    first_failure = {
                        "id": record.id,
                        "reason": "stored record_hash does not match the record's own content — it was edited after creation",
                    }
                else:
                    first_failure = {
                        "id": record.id,
                        "reason": "previous_hash does not match the prior record's record_hash — a record was "
                        "inserted, removed, or reordered",
                    }

            records.append(
                {
                    "id": record.id,
                    "report_date": record.report_date.isoformat(),
                    "county_name": record.county.name,
                    "facility_name": record.facility.name,
                    "confirmed_cases": record.confirmed_cases,
                    "record_hash": record.record_hash,
                    "previous_hash": record.previous_hash,
                    "self_valid": self_valid,
                    "link_valid": link_valid,
                    "valid": record_valid,
                }
            )
            # Walk forward using the STORED hash regardless of self_valid —
            # that's what a real downstream record's previous_hash was
            # actually set against, tampered or not.
            expected_previous_hash = record.record_hash

        return {
            "valid": first_failure is None,
            "total_records": len(records),
            "broken_at_id": first_failure["id"] if first_failure else None,
            "reason": first_failure["reason"] if first_failure else None,
            "records": records,
        }
