// ==UserScript==
// @name         Udemy Auto Close Non-Free / Auto Enroll Free
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Auto closes Udemy course tab if not 100% off or already enrolled, auto enrolls if free. Handles rate limiting.
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
        FORBIDDEN_WAIT_MIN: 30000,      // Wait 30-60 seconds when forbidden
        FORBIDDEN_WAIT_MAX: 60000,
        FORBIDDEN_MAX_RETRIES: 5,       // Try up to 5 times before giving up
        
        // Global throttle - prevents too many tabs acting at once
        GLOBAL_LOCK_KEY: 'udemy_global_lock',
        LOCK_TIMEOUT: 15000,            // Lock expires after 15 seconds (safety)
        LOCK_WAIT_INTERVAL: 2000,       // Check for lock every 2 seconds
        LOCK_MAX_WAIT: 120000,          // Max 2 minutes waiting for lock
    };

    const RETRY_KEY = 'udemy_retry_' + window.location.pathname;
    const FORBIDDEN_KEY = 'udemy_forbidden_' + window.location.pathname;

    console.log('Udemy auto-enroll script v2.3 loaded!');

    // ==================== FORBIDDEN PAGE DETECTION ====================
    
    function isForbiddenPage() {
        // Check if page just says "Forbidden"
        const bodyText = document.body?.innerText?.trim().toLowerCase();
        if (bodyText === 'forbidden') return true;
        
        // Also check for common block page indicators
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
    // Only one tab can act at a time to prevent mass simultaneous requests
    
    function acquireLock() {
        return new Promise(async (resolve, reject) => {
            const startTime = Date.now();
            
            const tryAcquire = async () => {
                const lockData = GM_getValue(CONFIG.GLOBAL_LOCK_KEY, null);
                const now = Date.now();
                
                // Check if lock exists and is still valid
                if (lockData) {
                    const lock = JSON.parse(lockData);
                    if (now - lock.timestamp < CONFIG.LOCK_TIMEOUT) {
                        // Lock is held by another tab
                        if (now - startTime > CONFIG.LOCK_MAX_WAIT) {
                            console.log('Waited too long for lock, proceeding anyway...');
                            resolve();
                            return;
                        }
                        
                        // Add some randomness to prevent all tabs checking at exact same time
                        const jitter = randomDelay(0, 1000);
                        await bgSleep(CONFIG.LOCK_WAIT_INTERVAL + jitter);
                        tryAcquire();
                        return;
                    }
                }
                
                // Acquire the lock
                GM_setValue(CONFIG.GLOBAL_LOCK_KEY, JSON.stringify({
                    timestamp: now,
                    url: window.location.href
                }));
                
                console.log('Acquired global lock, proceeding...');
                resolve();
            };
            
            // Add initial random delay so tabs don't all start at once
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
        releaseLock(); // Release before closing
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

    function findButtonByText(text) {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            if (btn.textContent.toLowerCase().includes(text.toLowerCase())) {
                return btn;
            }
        }
        return null;
    }

    // ==================== MAIN LOGIC ====================
    
    async function main() {
        // Check for Forbidden page FIRST
        if (isForbiddenPage()) {
            await handleForbidden();
            return;
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
                'aside button.ud-btn-large'
            ];

            try {
                const btn = await waitForElement(checkoutSelectors);
                console.log('Found checkout button...');
                clearRetryCount();
                await humanClick(btn);
                console.log('Clicked checkout button!');
                releaseLock();
            } catch {
                const enrollBtn = findButtonByText('enroll now') || findButtonByText('complete checkout');
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
        // Only process if we're on a course page
        if (!window.location.href.includes('/course/')) {
            releaseLock();
            return;
        }
        
        console.log('On course page, analyzing...');

        const conditions = [
            () => {
                const enrolledBox = document.querySelector('[data-purpose="enrolled-box"]');
                if (enrolledBox) return { type: 'enrolled' };

                const goToCourse = document.querySelector('[data-purpose="buy-now-button"] .ud-btn-label');
                if (goToCourse && goToCourse.textContent.trim() === 'Go to course') {
                    return { type: 'enrolled' };
                }
                return null;
            },

            () => {
                const discountEl = document.querySelector('[data-purpose="discount-percentage"]');
                const priceEl = document.querySelector('[data-purpose="course-price-text"]');
                const enrollBtn = findButtonByText('enroll now');

                if (discountEl || priceEl || enrollBtn) {
                    let isFree = false;

                    if (discountEl && discountEl.textContent.includes('100%')) {
                        isFree = true;
                    }
                    if (priceEl) {
                        const priceText = priceEl.textContent.toLowerCase();
                        if (priceText.includes('free') || priceText.includes('$0')) {
                            isFree = true;
                        }
                    }

                    return { type: 'priceFound', isFree, enrollBtn };
                }
                return null;
            }
        ];

        try {
            const result = await waitForAny(conditions);
            clearRetryCount();

            if (result.type === 'enrolled') {
                console.log('Already enrolled. Closing tab...');
                await humanClose();
                return;
            }

            if (result.type === 'priceFound') {
                if (result.isFree) {
                    console.log('Course is FREE!');
                    const btn = result.enrollBtn || findButtonByText('enroll now');
                    if (btn) {
                        console.log('Preparing to click Enroll now...');
                        await humanClick(btn);
                        console.log('Clicked Enroll now!');
                        releaseLock();
                    } else {
                        console.log('Free but no enroll button found.');
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
