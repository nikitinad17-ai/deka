"""Publish the existing verified Windows binaries; never rebuild or overwrite assets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
import zipfile

REPO = 'nikitinad17-ai/deka'
TAG = 'v0.18.0'
SOURCE = '7844358154a7a9122cb2a47a3b691d20b4d8269b'
RUN = 41284682646
ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / '.github/releases/desktop-0.18.0'
ARTIFACTS = {'windows': 'deka-windows', 'native': 'native-windows-verification',
             'quality': 'browser-regression-results'}
BINARIES = {name: data['sha256'] for name, data in json.loads((TEMPLATES / 'MANIFEST.json').read_text(encoding='utf-8'))['files'].items()}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def api(endpoint, method='GET', payload=None, missing=False):
    cmd = ['gh', 'api', '--method', method, f'repos/{REPO}/{endpoint}']
    data = None
    if payload is not None:
        cmd += ['--input', '-']
        data = json.dumps(payload).encode()
    result = subprocess.run(cmd, input=data, capture_output=True, check=False)
    if result.returncode:
        error = result.stderr.decode(errors='replace')
        if missing and 'HTTP 404' in error:
            return None
        raise RuntimeError(error)
    return json.loads(result.stdout)


def prepare(archives, out):
    out.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((TEMPLATES / 'MANIFEST.json').read_text(encoding='utf-8'))
    assert manifest['source_commit'] == SOURCE and manifest['workflow_run'] == RUN
    check_ref = SOURCE if os.environ.get('GITHUB_ACTIONS') == 'true' else 'HEAD'
    for name, expected in manifest['application_objects'].items():
        actual = subprocess.check_output(['git', 'rev-parse', check_ref + ':' + name], cwd=ROOT, text=True).strip()
        assert actual == expected, name
        if os.environ.get('GITHUB_ACTIONS') == 'true':
            for measured in {manifest['soak_source_commit']}:
                actual = subprocess.check_output(['git', 'rev-parse', measured + ':' + name], cwd=ROOT, text=True).strip()
                assert actual == expected, name
    content = {}
    for kind, path in archives.items():
        assert sha(path.read_bytes()) == manifest['artifact_digests'][kind], kind
    with zipfile.ZipFile(archives['windows']) as z:
        assert z.testzip() is None
        for name, expected in BINARIES.items():
            data = z.read(name)
            assert sha(data) == expected and data[:2] == b'MZ', name
            (out / name).write_bytes(data)
            content[name] = data
    reports = {}
    for kind, name, count in [
        ('native', 'native-desktop-session-report.json', manifest['checks']['native_desktop_passed']),
        ('quality', 'desktop-session-report.json', manifest['checks']['quality_desktop_passed']),
        ('quality', 'mp3-transport-report.json', 15),
    ]:
        with zipfile.ZipFile(archives[kind]) as z:
            data = json.loads(z.read(name))
        assert len(data['tests']) == count and all(t['passed'] for t in data['tests']), name
        target = 'quality-' + name if name == 'desktop-session-report.json' else name
        reports[target] = data
    with zipfile.ZipFile(archives['native']) as z:
        identity = json.loads(z.read('native-integrity.json'))['child']
        assert identity['integrity'] == 8192 and not identity['elevated'] and not identity['restricted']
    soak = json.loads((TEMPLATES / 'reverse-soak-report.json').read_text(encoding='utf-8'))
    assert soak['source_commit'] == manifest['soak_source_commit']
    assert len(soak['tests']) == 6 and all(t['passed'] for t in soak['tests'])
    assert soak['elapsed_seconds'] >= 404
    reports['reverse-soak-report.json'] = soak
    manifest['release_tag'] = TAG
    manifest['release_date'] = '2026-11-01'
    content['READ-ME.txt'] = (TEMPLATES / 'READ-ME.txt').read_bytes()
    content['TEST-REPORT.md'] = (TEMPLATES / 'TEST-REPORT.md').read_bytes()
    content['MANIFEST.json'] = json.dumps(manifest, ensure_ascii=False, indent=2).encode()
    for name, report in reports.items():
        content[name] = json.dumps(report, ensure_ascii=False, indent=2).encode()
    with zipfile.ZipFile(archives['native']) as z:
        for name in ['echo-reverb-comparison.json', 'native-integrity.json', 'webview-version.json']:
            content[name] = z.read(name)
    with zipfile.ZipFile(archives['quality']) as z:
        for name, count in manifest['quality_reports'].items():
            data = json.loads(z.read(name))
            rows = data['tests'] if isinstance(data, dict) else data
            assert len(rows) == count and all(t['passed'] for t in rows), name
            content['quality/' + name] = z.read(name)
    bundle = out / 'Deka-Desktop-0.18.0-Windows.zip'
    with zipfile.ZipFile(bundle, 'w') as z:
        for name, data in content.items():
            entry = zipfile.ZipInfo(name, (2026, 11, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            z.writestr(entry, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(bundle) as z:
        assert z.testzip() is None
    (out / 'TEST-REPORT.md').write_bytes(content['TEST-REPORT.md'])
    assets = {name: sha((out / name).read_bytes()) for name in [*BINARIES, bundle.name, 'TEST-REPORT.md']}
    sums = ''.join(f'{digest}  {name}\n' for name, digest in assets.items())
    (out / 'SHA256SUMS.txt').write_text(sums, encoding='utf-8')
    assets['SHA256SUMS.txt'] = sha((out / 'SHA256SUMS.txt').read_bytes())
    body = (TEMPLATES / 'RELEASE-NOTES.md').read_text(encoding='utf-8')
    body += f"\n\nSHA-256 архива: `{assets[bundle.name]}`. Контрольные суммы остальных файлов — в SHA256SUMS.txt.\n"
    (out / 'release-notes.md').write_text(body, encoding='utf-8')
    return assets, body


def publish(out):
    assert os.environ.get('GITHUB_ACTIONS') == 'true'
    assert os.environ.get('GITHUB_REPOSITORY') == REPO
    assert os.environ.get('GITHUB_REF') == 'refs/heads/release/desktop-0.18.0'
    target = os.environ['GITHUB_SHA']
    run = api(f'actions/runs/{RUN}')
    assert run['head_sha'] == SOURCE and run['conclusion'] == 'success'
    jobs = api(f'actions/runs/{RUN}/jobs')['jobs']
    assert all(any(j['name'] == name and j['conclusion'] == 'success' for j in jobs) for name in ['quality', 'windows'])
    subprocess.run(['git', 'merge-base', '--is-ancestor', SOURCE, target], check=True)
    changed = subprocess.check_output(['git', 'diff', '--name-only', '--no-renames', SOURCE, target], text=True).splitlines()
    allowed = ['README.md', 'docs/RELEASE-0.18.0.md', 'scripts/publish-desktop-018.py',
               '.github/workflows/publish-desktop-0.18.0.yml']
    assert all(name in allowed or name.startswith('.github/releases/desktop-0.18.0/') for name in changed)
    artifacts = api(f'actions/runs/{RUN}/artifacts')['artifacts']
    with tempfile.TemporaryDirectory() as td:
        archives = {}
        for kind, name in ARTIFACTS.items():
            artifact = next(a for a in artifacts if a['name'] == name)
            assert not artifact['expired'] and artifact['workflow_run']['head_sha'] == SOURCE
            path = Path(td) / (kind + '.zip')
            with path.open('wb') as output:
                subprocess.run(['gh', 'api', f'repos/{REPO}/actions/artifacts/{artifact["id"]}/zip'], stdout=output, check=True)
            assert artifact['digest'] == 'sha256:' + sha(path.read_bytes())
            archives[kind] = path
        assets, body = prepare(archives, out)
    tag = api(f'git/ref/tags/{TAG}', missing=True)
    if tag:
        assert tag['object']['type'] == 'commit' and tag['object']['sha'] == target, 'Existing tag points elsewhere'
    # Draft first; publish only after every remote asset has its expected digest.
    release = api(f'releases/tags/{TAG}', missing=True)
    if release is None:
        release = next((r for r in api('releases?per_page=100') if r['tag_name'] == TAG), None)
    if release is None:
        release = api('releases', 'POST', {'tag_name': TAG, 'target_commitish': target,
            'name': 'Дека Desktop 0.18.0 — Реверс A/B и Shuffle', 'body': body,
            'draft': True, 'prerelease': False})
    assert release['target_commitish'] == target
    if release['draft']:
        present = {a['name']: a for a in release['assets']}
        for name, digest in assets.items():
            if name in present:
                assert present[name]['digest'] == 'sha256:' + digest, name
            else:
                subprocess.run(['gh', 'release', 'upload', TAG, str(out / name), '--repo', REPO], check=True)
        release = api(f'releases/{release["id"]}')
        verify_assets(release, assets, out)
        release = api(f'releases/{release["id"]}', 'PATCH', {'draft': False, 'prerelease': False, 'make_latest': 'true'})
    assert not release['draft'] and not release['prerelease']
    verify_assets(api(f'releases/tags/{TAG}'), assets, out)
    assert api('releases/latest')['tag_name'] == TAG
    tag = api(f'git/ref/tags/{TAG}')
    assert tag['object']['sha'] == target
    # Read the public downloads back without authentication.
    for asset in release['assets']:
        if asset['name'] not in assets:
            continue
        for attempt in range(3):
            try:
                data = urllib.request.urlopen(asset['browser_download_url'], timeout=60).read()
                assert sha(data) == assets[asset['name']]
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2)
    result = {'url': release['html_url'], 'tag': TAG, 'tag_commit': target,
              'binary_source': SOURCE, 'build_run': RUN, 'assets': assets,
              'public_downloads_verified': True}
    (out / 'publication-report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))


def verify_assets(release, assets, out):
    remote = {a['name']: a for a in release['assets']}
    for name, digest in assets.items():
        assert remote[name]['state'] == 'uploaded'
        assert remote[name]['size'] == (out / name).stat().st_size
        assert remote[name]['digest'] == 'sha256:' + digest, name


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare-only', type=Path, help='Directory containing deka18-quality/native/windows.zip')
    parser.add_argument('--out', type=Path, default=Path('release-out'))
    args = parser.parse_args()
    if args.prepare_only:
        assets, _ = prepare({k: args.prepare_only / ('deka18-' + k + '.zip') for k in ARTIFACTS}, args.out)
        print(json.dumps(assets))
    else:
        publish(args.out)
