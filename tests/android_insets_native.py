"""Keep the CI entry point; Android WebView uses Playwright's supported Node Android API."""
import subprocess, sys
from pathlib import Path
subprocess.run(['node', str(Path(__file__).with_suffix('.cjs')), *sys.argv[1:]], check=True)
