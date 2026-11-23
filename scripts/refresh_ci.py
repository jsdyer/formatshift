#!/usr/bin/env python3
"""Refresh the opening selection only when the main push changes its config."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
from collect import Client, ROOT, collect


def config_changed(before, after, git=None):
    """Use the entire pushed range, not only the final commit."""
    git = git or (lambda args: subprocess.check_output(['git', *args], cwd=ROOT, text=True))
    if not before or set(before) == {'0'}:
        return True
    return bool(git(['diff', '--name-only', before, after, '--', 'web/config.json']).strip())


def refresh_opening(root=ROOT, client=None):
    config = json.loads((root / 'web/config.json').read_text())
    result = collect(client or Client(config['requestIntervalMs']/1000), config)
    encoded = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    # Archive the successful API result even if a later Git push cannot persist it.
    (root / 'collection-checks').mkdir(exist_ok=True)
    (root / 'collection-checks/api-receipt.json').write_text(encoded, encoding='utf-8')
    target = root / 'web/data/opening.json'
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=target.parent, suffix='.tmp', delete=False) as f:
        f.write(encoded)
        temporary = Path(f.name)
    temporary.replace(target)
    return len(result['releases'])


def output(key, value):
    with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
        f.write(f'{key}={value}\n')


def main():
    if not config_changed(os.environ.get('BEFORE_SHA', ''), os.environ['AFTER_SHA']):
        output('refreshed', 'false')
        print('Opening config unchanged; keeping retained metadata without polling MusicBrainz.')
        return
    try:
        count = refresh_opening()
    except Exception as exc:
        # collect() returns only after every response validates; the old file is untouched.
        output('refreshed', 'false')
        print(f'::warning::MusicBrainz collection failed ({type(exc).__name__}: {exc}). Retained opening data is unchanged.')
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
            f.write('MusicBrainz opening refresh failed. The last retained collection was preserved; this run does not claim a fresh API capture.\n')
        return
    output('refreshed', 'true')
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as f:
        f.write(f'MusicBrainz API collection succeeded: {count} editions fetched with the app User-Agent and serial 1.2-second pacing. The API receipt is available in the collection-checks artifact.\n')
    print(f'Collected {count} opening editions from the live MusicBrainz API.')


if __name__ == '__main__':
    main()
