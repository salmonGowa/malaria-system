import sys
from pathlib import Path

# main.py and the app/ modules import each other as `from app.xxx import yyy`,
# which only resolves if ml_service/ itself is on sys.path — true when uvicorn
# is launched from inside ml_service/ (see scripts/dev-up.sh), not necessarily
# true when pytest is invoked from the repo root. Insert it here so tests work
# regardless of the invocation cwd, same fix as backend/manage.py.
sys.path.insert(0, str(Path(__file__).resolve().parent))
