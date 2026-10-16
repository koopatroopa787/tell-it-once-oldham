import os
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("FIRSTSTEP_BASE_URL", "http://localhost:3000")
base_parts = urlsplit(BASE_URL)
BASE_ORIGIN = f"{base_parts.scheme}://{base_parts.netloc}"


def choose_alex(page):
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Try Alex's story").click()
    page.wait_for_function("() => document.querySelector('input[value=engineering]')?.checked")
    assert page.get_by_role("radio", name="Engineering").is_checked()
    assert page.get_by_role("radio", name="Travel is difficult").is_checked()
    page.get_by_role("button", name="Find my first step").click()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)

    desktop = browser.new_page(viewport={"width": 1440, "height": 1000})
    choose_alex(desktop)
    desktop.get_by_role("heading", name="Your first doable step").wait_for()
    assert "travel support" in desktop.locator("[data-testid='first-action']").inner_text().lower()
    assert desktop.get_by_text("Travel feasibility not checked.").is_visible()
    assert desktop.locator("a[href='https://www.oldham.ac.uk/study/school-leavers/']").first.is_visible()
    assert desktop.locator("a[href='https://positive-steps.org.uk/services/career-guidance/']").first.is_visible()

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    choose_alex(mobile)
    mobile.get_by_text("Not sure where to start", exact=True).last.click()
    mobile.locator("[data-testid='first-action']").get_by_text("careers adviser", exact=False).wait_for()
    assert not mobile.get_by_text("Travel feasibility not checked.").is_visible()
    assert "positive steps" in mobile.locator("[data-testid='primary-provider']").inner_text().lower()
    assert "routes" in mobile.locator("[data-testid='question-to-ask']").inner_text().lower()

    passport = browser.new_page(viewport={"width": 1280, "height": 900})
    passport.add_init_script("window.print = () => { window.__PRINT_CALLED__ = true; }")
    choose_alex(passport)
    passport.get_by_role("button", name="Make my Passport").click()
    passport.context.grant_permissions(
        ["clipboard-read", "clipboard-write"], origin=BASE_ORIGIN
    )
    include_barrier = passport.get_by_role("checkbox", name="Include my barrier in printed and copied plans")
    assert not include_barrier.is_checked()
    passport.get_by_role("button", name="Copy plan").click()
    passport.get_by_text("Plan copied to your clipboard.").wait_for()
    copied_plan = passport.evaluate("navigator.clipboard.readText()")
    assert "Engineering" in copied_plan
    assert "https://www.oldham.ac.uk/study/school-leavers/" in copied_plan
    assert "Question to ask" in copied_plan
    assert "Travel is difficult" not in copied_plan
    assert "Travel feasibility not checked." in copied_plan
    passport.get_by_role("button", name="Print / Save PDF").click()
    assert passport.evaluate("window.__PRINT_CALLED__ === true")
    include_barrier.check(force=True)
    assert passport.locator("[data-testid='passport-barrier']").is_visible()
    include_barrier.uncheck(force=True)
    assert not passport.locator("[data-testid='passport-barrier']").is_visible()
    passport.emulate_media(media="print")
    assert passport.locator("[data-testid='passport']").is_visible()
    assert not passport.locator("header").is_visible()
    assert not passport.locator("[data-testid='passport-actions']").is_visible()
    assert not passport.locator("footer").is_visible()

    browser.close()

print("3 smoke scenarios passed")
