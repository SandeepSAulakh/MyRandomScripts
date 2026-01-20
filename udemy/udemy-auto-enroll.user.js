// ==UserScript==
// @name         Udemy Auto Close Non-Free / Auto Enroll Free
// @namespace    http://tampermonkey.net/
// @version      2.9
// @description  Auto closes Udemy course tab if not 100% off or already enrolled, auto enrolls if free. Handles rate limiting.
// @author       SandeepSAulakh
// @homepageURL  https://github.com/SandeepSAulakh/MyRandomScripts
// @supportURL   https://github.com/SandeepSAulakh/MyRandomScripts/issues
// @updateURL    https://raw.githubusercontent.com/SandeepSAulakh/MyRandomScripts/main/udemy/udemy-auto-enroll.user.js
// @downloadURL  https://raw.githubusercontent.com/SandeepSAulakh/MyRandomScripts/main/udemy/udemy-auto-enroll.user.js
// @match        https://www.udemy.com/course/*
// @match        https://www.udemy.com/payment/checkout/*
// @match        https://www.udemy.com/cart/success/*
// @match        https://www.udemy.com/*
// @run-at       document-idle
// @grant        window.close
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        MAX_RETRIES: 3,
        ELEMENT_POLL_INTERVAL: 500,
        MAX_WAIT_TIME: 20000,
        MIN_ACTION_DELAY: 1500,
        MAX_ACTION_DELAY: 4000,
        MIN_CLOSE_DELAY: 800,
        MAX_CLOSE_DELAY: 2000,

        // Rate limit handling
        // 45 seconds min wait
        FORBIDDEN_WAIT_MIN: 45000,
        // 90 seconds max wait
        FORBIDDEN_WAIT_MAX: 90000,
        // Fewer retries, longer waits
        FORBIDDEN_MAX_RETRIES: 3,

        // Global throttle
        GLOBAL_LOCK_KEY: 'udemy_global_lock',
        // Longer lock timeout
        LOCK_TIMEOUT: 20000,
        LOCK_WAIT_INTERVAL: 2000,
        LOCK_MAX_WAIT: 120000,
    };

    const RETRY_KEY = 'udemy_retry_' + window.location.pathname;
    const FORBIDDEN_KEY = 'udemy_forbidden_' + window.location.pathname;

    console.log('Udemy auto-enroll script v2.9 loaded!');

    // ==================== FORBIDDEN PAGE DETECTION ====================

    function isForbiddenPage() {
        const bodyText = document.body?.innerText?.trim().toLowerCase();
        if (bodyText === 'forbidden') return true;
        if (document.title.toLowerCase().includes('forbidden')) return true;
        if (document.title.toLowerCase().includes('blocked')) return true;
        if (document.title.toLowerCase().includes('access denied')) return true;
        return false;
    }

    async function handleForbidden() {
        const forbiddenCount = parseInt(GM_getValue(FORBIDDEN_KEY, '0'));

        if (forbiddenCount >= CONFIG.FORBIDDEN_MAX_RETRIES) {
            console.log('Too many forbidden errors. Leaving tab open for manual review.');
            GM_setValue(FORBIDDEN_KEY, '0');
            return;
        }

        const waitTime = randomDelay(CONFIG.FORBIDDEN_WAIT_MIN, CONFIG.FORBIDDEN_WAIT_MAX);
        console.log(`Forbidden page detected! Waiting ${Math.round(waitTime/1000)}s before retry... (attempt ${forbiddenCount + 1}/${CONFIG.FORBIDDEN_MAX_RETRIES})`);

        GM_setValue(FORBIDDEN_KEY, String(forbiddenCount + 1));

        await bgSleep(waitTime);
        location.reload();
    }

    // ==================== GLOBAL THROTTLE (LOCK) ====================

    function acquireLock() {
        return new Promise(async (resolve, reject) => {
            const startTime = Date.now();

            const tryAcquire = async () => {
                const lockData = GM_getValue(CONFIG.GLOBAL_LOCK_KEY, null);
                const now = Date.now();

                if (lockData) {
                    const lock = JSON.parse(lockData);
                    if (now - lock.timestamp < CONFIG.LOCK_TIMEOUT) {
                        if (now - startTime > CONFIG.LOCK_MAX_WAIT) {
                            console.log('Waited too long for lock, proceeding anyway...');
                            resolve();
                            return;
                        }

                        const jitter = randomDelay(0, 1000);
                        await bgSleep(CONFIG.LOCK_WAIT_INTERVAL + jitter);
                        tryAcquire();
                        return;
                    }
                }

                GM_setValue(CONFIG.GLOBAL_LOCK_KEY, JSON.stringify({
                    timestamp: now,
                    url: window.location.href
                }));

                console.log('Acquired global lock, proceeding...');
                resolve();
            };

            await bgSleep(randomDelay(0, 3000));
            tryAcquire();
        });
    }

    function releaseLock() {
        GM_setValue(CONFIG.GLOBAL_LOCK_KEY, null);
        console.log('Released global lock');
    }

    // ==================== BACKGROUND-SAFE TIMER ====================

    const workerBlob = new Blob([`
        self.onmessage = function(e) {
            const { id, delay } = e.data;
            setTimeout(() => self.postMessage({ id }), delay);
        };
    `], { type: 'application/javascript' });

    const timerWorker = new Worker(URL.createObjectURL(workerBlob));
    const pendingTimers = new Map();
    let timerId = 0;

    timerWorker.onmessage = function(e) {
        const callback = pendingTimers.get(e.data.id);
        if (callback) {
            pendingTimers.delete(e.data.id);
            callback();
        }
    };

    function bgSetTimeout(callback, delay) {
        const id = timerId++;
        pendingTimers.set(id, callback);
        timerWorker.postMessage({ id, delay });
        return id;
    }

    function bgSleep(ms) {
        return new Promise(resolve => bgSetTimeout(resolve, ms));
    }

    // ==================== HELPERS ====================

    function randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async function humanDelay(min = CONFIG.MIN_ACTION_DELAY, max = CONFIG.MAX_ACTION_DELAY) {
        const delay = randomDelay(min, max);
        console.log(`Waiting ${delay}ms to appear human...`);
        await bgSleep(delay);
    }

    async function humanClick(btn) {
        await humanDelay();
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await bgSleep(randomDelay(200, 500));
        btn.click();
    }

    async function humanClose() {
        await humanDelay(CONFIG.MIN_CLOSE_DELAY, CONFIG.MAX_CLOSE_DELAY);
        releaseLock();
        window.close();
    }

    function waitForElement(selectors, timeout = CONFIG.MAX_WAIT_TIME) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            const check = () => {
                for (const selector of selectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        resolve(el);
                        return;
                    }
                }

                if (Date.now() - startTime > timeout) {
                    reject(new Error('Timeout waiting for elements'));
                    return;
                }

                bgSetTimeout(check, CONFIG.ELEMENT_POLL_INTERVAL);
            };

            check();
        });
    }

    function waitForAny(conditions, timeout = CONFIG.MAX_WAIT_TIME) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            const check = () => {
                for (const condition of conditions) {
                    const result = condition();
                    if (result) {
                        resolve(result);
                        return;
                    }
                }

                if (Date.now() - startTime > timeout) {
                    reject(new Error('Timeout waiting for conditions'));
                    return;
                }

                bgSetTimeout(check, CONFIG.ELEMENT_POLL_INTERVAL);
            };

            check();
        });
    }

    function handleStuckPage(reason) {
        const retryCount = parseInt(GM_getValue(RETRY_KEY, '0'));

        if (retryCount < CONFIG.MAX_RETRIES) {
            console.log(`Page appears stuck (${reason}). Retry ${retryCount + 1}/${CONFIG.MAX_RETRIES}...`);
            GM_setValue(RETRY_KEY, String(retryCount + 1));
            releaseLock();
            location.reload();
        } else {
            console.log(`Max retries reached. Leaving tab open for manual review.`);
            GM_setValue(RETRY_KEY, '0');
            releaseLock();
        }
    }

    function clearRetryCount() {
        GM_setValue(RETRY_KEY, '0');
        GM_setValue(FORBIDDEN_KEY, '0');
    }

    // Find button by text (searches both button text and nested spans)
    function findButtonByText(text) {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const btnText = btn.textContent.toLowerCase().trim();
            if (btnText.includes(text.toLowerCase())) {
                return btn;
            }
        }
        return null;
    }

    // Find Enroll button using multiple strategies
    function findEnrollButton() {
        // Strategy 1: data-purpose="buy-now-button" with "Enroll" text (new Udemy UI)
        const buyNowBtn = document.querySelector('button[data-purpose="buy-now-button"]');
        if (buyNowBtn) {
            const btnText = buyNowBtn.textContent.toLowerCase();
            if (btnText.includes('enroll')) {
                console.log('Found enroll button via data-purpose="buy-now-button"');
                return buyNowBtn;
            }
        }

        // Strategy 2: Find by text "enroll now"
        const textBtn = findButtonByText('enroll now');
        if (textBtn) {
            console.log('Found enroll button via text search');
            return textBtn;
        }

        // Strategy 3: Look for .ud-btn-label containing "Enroll"
        const labels = document.querySelectorAll('.ud-btn-label');
        for (const label of labels) {
            if (label.textContent.toLowerCase().includes('enroll')) {
                const btn = label.closest('button');
                if (btn) {
                    console.log('Found enroll button via .ud-btn-label');
                    return btn;
                }
            }
        }

        // Strategy 4: Any button with "enroll" in text
        const enrollBtn = findButtonByText('enroll');
        if (enrollBtn) {
            console.log('Found enroll button via generic "enroll" text search');
            return enrollBtn;
        }

        return null;
    }

    // Check if already enrolled
    function isAlreadyEnrolled() {
        // Check for enrolled box
        const enrolledBox = document.querySelector('[data-purpose="enrolled-box"]');
        if (enrolledBox) {
            console.log('Enrolled detected: data-purpose="enrolled-box"');
            return true;
        }

        // Check for "You purchased this course" span (new UI)
        // Class pattern: enrolled-box-module-scss-module__*__enrolled-message
        const enrolledSpan = document.querySelector('span[class*="enrolled-message"]');
        if (enrolledSpan && enrolledSpan.textContent.toLowerCase().includes('purchased')) {
            console.log('Enrolled detected: span with enrolled-message class');
            return true;
        }

        // Also check any element with enrolled-message in class
        const enrolledMessage = document.querySelector('[class*="enrolled-message"]');
        if (enrolledMessage && enrolledMessage.textContent.toLowerCase().includes('purchased')) {
            console.log('Enrolled detected: element with enrolled-message class');
            return true;
        }

        // Check for "Go to course" button (new UI)
        const buyNowBtn = document.querySelector('button[data-purpose="buy-now-button"]');
        if (buyNowBtn) {
            const btnText = buyNowBtn.textContent.toLowerCase().trim();
            if (btnText.includes('go to course')) {
                console.log('Enrolled detected: Go to course button');
                return true;
            }
        }

        // Check via .ud-btn-label (old UI)
        const goToCourseLabel = document.querySelector('[data-purpose="buy-now-button"] .ud-btn-label');
        if (goToCourseLabel && goToCourseLabel.textContent.trim().toLowerCase() === 'go to course') {
            console.log('Enrolled detected: Go to course label');
            return true;
        }

        return false;
    }

    // Fast close for already enrolled - no need to wait
    function fastClose() {
        console.log('Fast closing (already enrolled)...');
        window.close();
    }

    // Check if course is free
    function isCourseFree() {
        // Check discount percentage
        const discountEl = document.querySelector('[data-purpose="discount-percentage"]');
        if (discountEl && discountEl.textContent.includes('100%')) {
            console.log('Course is free: 100% discount found');
            return true;
        }

        // Check price text
        const priceEl = document.querySelector('[data-purpose="course-price-text"]');
        if (priceEl) {
            const priceText = priceEl.textContent.toLowerCase().trim();
            if (priceText.includes('free') || priceText.includes('$0') || priceText === 'free') {
                console.log('Course is free: price shows Free/$0');
                return true;
            }
        }

        return false;
    }

    // ==================== MAIN LOGIC ====================

    async function main() {
        // Check for Forbidden page FIRST
        if (isForbiddenPage()) {
            await handleForbidden();
            return;
        }

        // ==================== EARLY ENROLLED CHECK (NO LOCK NEEDED) ====================
        // For course pages, wait for key elements then check enrolled status
        if (window.location.href.includes('/course/')) {
            console.log('Waiting for page content to load...');

            // Wait for the buy/enroll button to appear (indicates page is loaded)
            const maxWait = 10000;
            const startTime = Date.now();

            while (Date.now() - startTime < maxWait) {
                const buyBtn = document.querySelector('button[data-purpose="buy-now-button"]');
                const enrolledBox = document.querySelector('[data-purpose="enrolled-box"]');
                const enrolledSpan = document.querySelector('span[class*="enrolled-message"]');

                // Page has loaded enough to check
                if (buyBtn || enrolledBox || enrolledSpan) {
                    console.log('Page content loaded, checking enrolled status...');

                    // Check if already enrolled
                    if (isAlreadyEnrolled()) {
                        console.log('Already enrolled! Fast closing...');
                        clearRetryCount();
                        fastClose();
                        return;
                    }

                    // Not enrolled, continue to normal flow
                    console.log('Not enrolled, continuing to normal flow...');
                    break;
                }

                await bgSleep(500);
            }

            if (Date.now() - startTime >= maxWait) {
                console.log('Timeout waiting for page content, continuing anyway...');
            }
        }

        // Wait for global lock (one tab at a time)
        await acquireLock();

        // ==================== SUCCESS PAGE ====================
        if (window.location.href.includes('/cart/success/')) {
            console.log('Enrollment successful! Closing tab...');
            clearRetryCount();
            await humanClose();
            return;
        }

        // ==================== CHECKOUT PAGE ====================
        if (window.location.href.includes('/payment/checkout/')) {
            console.log('On checkout page, waiting for Enroll button...');

            const checkoutSelectors = [
                'button.checkout-button--checkout-button--button--XFnK-',
                'button[data-testid="checkout-button"]',
                'button[data-purpose="checkout-button"]',
                'aside button.ud-btn-large',
                'aside button.ud-btn-primary'
            ];

            try {
                const btn = await waitForElement(checkoutSelectors);
                console.log('Found checkout button via selector...');
                clearRetryCount();
                await humanClick(btn);
                console.log('Clicked checkout button!');
                releaseLock();
            } catch {
                // Fallback: find by text
                const enrollBtn = findButtonByText('enroll now') ||
                                  findButtonByText('complete checkout') ||
                                  findButtonByText('complete payment');
                if (enrollBtn) {
                    console.log('Found button via text fallback...');
                    clearRetryCount();
                    await humanClick(enrollBtn);
                    console.log('Clicked fallback button!');
                    releaseLock();
                } else {
                    handleStuckPage('checkout button not found');
                }
            }

            return;
        }

        // ==================== COURSE PAGE ====================
        if (!window.location.href.includes('/course/')) {
            releaseLock();
            return;
        }

        console.log('On course page, analyzing...');

        const conditions = [
            // Condition 1: Already enrolled
            () => {
                if (isAlreadyEnrolled()) {
                    return { type: 'enrolled' };
                }
                return null;
            },

            // Condition 2: Price info visible
            () => {
                const discountEl = document.querySelector('[data-purpose="discount-percentage"]');
                const priceEl = document.querySelector('[data-purpose="course-price-text"]');
                const enrollBtn = findEnrollButton();

                // Need at least price info or enroll button to proceed
                if (discountEl || priceEl || enrollBtn) {
                    const isFree = isCourseFree();
                    return { type: 'priceFound', isFree, enrollBtn };
                }
                return null;
            }
        ];

        try {
            const result = await waitForAny(conditions);
            clearRetryCount();

            if (result.type === 'enrolled') {
                console.log('Already enrolled. Fast closing...');
                releaseLock();
                fastClose();
                return;
            }

            if (result.type === 'priceFound') {
                if (result.isFree) {
                    console.log('Course is FREE!');
                    const btn = result.enrollBtn || findEnrollButton();
                    if (btn) {
                        console.log('Preparing to click Enroll now...');
                        await humanClick(btn);
                        console.log('Clicked Enroll now!');
                        releaseLock();
                    } else {
                        console.log('Free but no enroll button found. Page HTML logged below:');
                        console.log(document.querySelector('[data-purpose="buy-now-button"]')?.outerHTML || 'buy-now-button not found');
                        releaseLock();
                    }
                } else {
                    console.log('Course is NOT free. Closing tab...');
                    await humanClose();
                }
            }
        } catch {
            handleStuckPage('page elements not loaded');
        }
    }

    // Start the script
    main();

})();
