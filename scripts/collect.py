#!/usr/bin/env python3
"""Collect public core metadata, serially, with MusicBrainz application identity."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
MBID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
UA = 'CoolCodeFormatShift/1.0 (https://coolcode.ca/formatshift/)'


def validate_id(value):
    if not MBID.fullmatch(value):
        raise ValueError('Expected a MusicBrainz UUID, not an artist name or arbitrary URL.')
    return value.lower()


def validate_release(r):
    if not isinstance(r, dict) or not MBID.fullmatch(r.get('id', '')) or not r.get('title'):
        raise ValueError('MusicBrainz returned an invalid release.')
    return r


def core_release(r):
    """Retain only core bibliographic fields, not ratings/tags/relationships/artwork."""
    validate_release(r)
    keys = ['id', 'title', 'date', 'country', 'status', 'barcode', 'packaging', 'disambiguation', 'artist-credit', 'release-group', 'label-info']
    result = {k: r[k] for k in keys if k in r}
    result['media'] = [{k: m[k] for k in ['position', 'title', 'format', 'track-count'] if k in m} for m in r.get('media', [])]
    return result


class Client:
    def __init__(self, interval=1.2):
        self.interval = max(1.1, interval)
        self.last = 0

    def get(self, path, **params):
        time.sleep(max(0, self.interval - (time.monotonic() - self.last)))
        url = 'https://musicbrainz.org/ws/2/' + path + '?' + urlencode({'fmt': 'json', **params})
        self.last = time.monotonic()
        req = Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        with urlopen(req, timeout=35) as response:
            data = json.load(response)
        if not isinstance(data, dict) or data.get('error'):
            raise ValueError('MusicBrainz returned an error or unexpected response.')
        return data


def collect(client, config, mode='opening', identifier='', limit=100):
    if not 1 <= limit <= 2000:
        raise ValueError('Limit must be 1–2000 releases.')
    inc = 'artist-credits+media+labels+release-groups'
    if mode == 'opening':
        ids = config['opening']['releaseIds']
        if not 1 <= len(ids) <= 100:
            raise ValueError('Choose 1–100 configured opening releases.')
        releases = [core_release(client.get('release/' + validate_id(rid), inc=inc)) for rid in ids]
        title = config['opening']['title']
        source = 'https://musicbrainz.org/release-group/' + validate_id(config['opening']['releaseGroupId'])
        method = 'Selected editions fetched individually from the MusicBrainz API. Not a complete catalogue.'
    else:
        identifier = validate_id(identifier)
        source = f'https://musicbrainz.org/{mode}/{identifier}'
        if mode == 'release':
            releases = [core_release(client.get('release/' + identifier, inc=inc))]
            title = releases[0]['title']
            method = 'MusicBrainz API single-release lookup.'
        elif mode in ('artist', 'release-group'):
            entity = client.get(f'{mode}/{identifier}')
            title = entity.get('name') or entity.get('title') or identifier
            releases, offset, total = [], 0, 1
            while offset < min(total, limit):
                data = client.get('release', **{mode: identifier, 'inc': inc, 'limit': min(100, limit-offset), 'offset': offset})
                page, total = data.get('releases'), data.get('release-count')
                if not isinstance(page, list) or not isinstance(total, int):
                    raise ValueError('Invalid release browse response.')
                if not page:
                    break
                releases.extend(core_release(r) for r in page)
                offset += len(page)
            releases = list({r['id']: r for r in releases}.values())
            method = f'MusicBrainz API browse by {mode}; {len(releases)} retained of {total} reported. Limited collection.'
        else:
            raise ValueError('Unsupported mode.')
    if not releases:
        raise ValueError('No releases returned; existing output was not replaced.')
    return {'schemaVersion': 1, 'title': title, 'capturedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'method': method, 'source': source, 'releases': releases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['opening', 'artist', 'release-group', 'release'], default='opening')
    parser.add_argument('--id', default='')
    parser.add_argument('--limit', type=int, default=100)
    parser.add_argument('--output', type=Path, default=ROOT / 'web/data/opening.json')
    args = parser.parse_args()
    config = json.loads((ROOT / 'web/config.json').read_text())
    result = collect(Client(config['requestIntervalMs']/1000), config, args.mode, args.id, args.limit)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    stage = args.output.with_suffix('.tmp')
    stage.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    stage.replace(args.output)
    print(f"Saved {len(result['releases'])} MusicBrainz editions to {args.output}")


if __name__ == '__main__':
    main()
