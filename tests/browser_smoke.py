"""Exercise Format Shift at a project subpath in Chromium."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    retained = json.loads((ROOT / "dist/data/opening.json").read_text())
    expected = len(retained["releases"])
    title = retained["releases"][0]["title"]
    screenshots = ROOT / "browser-checks"
    screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT / "dist", Path(temporary) / "example-tool")
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=temporary))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 1280, "height": 1000})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(f"http://127.0.0.1:{server.server_port}/example-tool/")
                page.locator("#edition-count").filter(has_text=f"{expected} edition").wait_for()
                assert page.locator(".edition").count() == expected
                page.locator("#filter-text").fill(title)
                assert page.locator(".edition").count() > 0
                page.locator("#reset-filters").click()
                page.locator(".compare-check input").nth(0).check()
                if expected > 1:
                    page.locator(".compare-check input").nth(1).check()
                assert page.locator(".compare-card").count() == min(2, expected)
                page.locator("#filter-text").fill('<img src=x onerror="alert(1)">')
                assert page.locator(".edition").count() == 0
                assert page.locator("img").count() == 0
                page.locator("#reset-filters").click()
                page.route("https://musicbrainz.org/**", lambda route: route.fulfill(status=503, content_type="application/json", body='{"error":"busy"}'))
                page.locator("#query").fill("Any arbitrary artist")
                page.locator("#search-submit").click()
                page.locator("#status").filter(has_text="current collection is unchanged").wait_for()
                assert page.locator(".edition").count() == expected
                page.locator("#opening").click()
                page.screenshot(path=str(screenshots / "desktop.png"), full_page=True)
                page.set_viewport_size({"width": 390, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                page.screenshot(path=str(screenshots / "mobile.png"), full_page=True)
                assert not errors, errors
                browser.close()
            print("Browser checks passed: project subpath, retained data, format filters, comparison, source failure preservation and mobile layout")
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
