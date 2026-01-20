// ==UserScript==
// @name         Gmail Open All Udemy REDEEM OFFER Links
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Adds a button to open all REDEEM OFFER links in new tabs with batch processing
// @author       SandeepSAulakh
// @homepageURL  https://github.com/SandeepSAulakh/MyRandomScripts
// @supportURL   https://github.com/SandeepSAulakh/MyRandomScripts/issues
// @updateURL    https://raw.githubusercontent.com/SandeepSAulakh/MyRandomScripts/main/udemy/gmail-open-udemy-links.user.js
// @downloadURL  https://raw.githubusercontent.com/SandeepSAulakh/MyRandomScripts/main/udemy/gmail-open-udemy-links.user.js
// @match        https://mail.google.com/mail/*
// @run-at       document-idle
// @grant        GM_openInTab
// ==/UserScript==

(function() {
    'use strict';

    console.log('Gmail REDEEM OFFER script v1.4 loaded!');

    // Global state for stop functionality
    let isProcessing = false;
    let shouldStop = false;

    // Configuration
    const CONFIG = {
        BATCH_SIZE: 5,
        MIN_DELAY_IN_BATCH: 2000,
        MAX_DELAY_IN_BATCH: 4000,
        MIN_BATCH_PAUSE: 10000,
        MAX_BATCH_PAUSE: 15000
    };

    const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    // Interruptible sleep
    function sleep(ms) {
        return new Promise(resolve => {
            const checkInterval = 500;
            let elapsed = 0;
            const timer = setInterval(() => {
                elapsed += checkInterval;
                if (shouldStop || elapsed >= ms) {
                    clearInterval(timer);
                    resolve();
                }
            }, checkInterval);
        });
    }

    // Find all REDEEM OFFER links
    function findRedeemLinks() {
        const links = document.querySelectorAll('a');
        const redeemLinks = [];

        for (const link of links) {
            if (link.textContent.trim() === 'REDEEM OFFER') {
                redeemLinks.push(link.href);
            }
        }

        // Remove duplicates
        return [...new Set(redeemLinks)];
    }

    // Update button visibility based on links found
    function updateButtonVisibility() {
        const btn = document.getElementById('redeem-all-btn');
        if (!btn) return;

        const links = findRedeemLinks();

        if (links.length > 0 && !isProcessing) {
            btn.style.display = 'block';
            btn.textContent = `🎓 Open ${links.length} REDEEM OFFER`;
        } else if (!isProcessing) {
            btn.style.display = 'none';
        }
    }

    // Add floating buttons
    function addButton() {
        if (document.getElementById('redeem-all-btn')) return;

        // Main button (hidden by default)
        const btn = document.createElement('button');
        btn.id = 'redeem-all-btn';
        btn.textContent = '🎓 Open REDEEM OFFER';
        btn.style.cssText = `
            position: fixed !important;
            bottom: 20px !important;
            right: 20px !important;
            z-index: 99999 !important;
            padding: 0 25px !important;
            background: #1a73e8 !important;
            color: white !important;
            border: none !important;
            border-radius: 8px !important;
            font-size: 14px !important;
            font-weight: bold !important;
            cursor: pointer !important;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3) !important;
            display: none;
            height: 50px !important;
            line-height: 50px !important;
            white-space: nowrap !important;
            min-width: 200px !important;
        `;

        // Stop button (hidden by default)
        const stopBtn = document.createElement('button');
        stopBtn.id = 'redeem-stop-btn';
        stopBtn.textContent = '⛔ STOP';
        stopBtn.style.cssText = `
            position: fixed !important;
            bottom: 20px !important;
            right: 250px !important;
            z-index: 99999 !important;
            padding: 0 25px !important;
            background: #dc3545 !important;
            color: white !important;
            border: none !important;
            border-radius: 8px !important;
            font-size: 14px !important;
            font-weight: bold !important;
            cursor: pointer !important;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3) !important;
            display: none;
            height: 50px !important;
            line-height: 50px !important;
        `;

        stopBtn.onclick = function() {
            shouldStop = true;
            stopBtn.textContent = '⏹️ Stopping...';
            stopBtn.disabled = true;
            console.log('Stop requested by user...');
        };

        btn.onclick = async function() {
            if (isProcessing) return;

            const redeemLinks = findRedeemLinks();

            if (redeemLinks.length === 0) {
                alert('No REDEEM OFFER links found!');
                return;
            }

            // Reset state
            isProcessing = true;
            shouldStop = false;
            stopBtn.style.display = 'block';
            stopBtn.textContent = '⛔ STOP';
            stopBtn.disabled = false;

            btn.textContent = `🎓 Opening 0/${redeemLinks.length}...`;
            btn.disabled = true;
            btn.style.background = '#ff9800';

            let opened = 0;
            const totalBatches = Math.ceil(redeemLinks.length / CONFIG.BATCH_SIZE);

            for (let batch = 0; batch < totalBatches && !shouldStop; batch++) {
                const start = batch * CONFIG.BATCH_SIZE;
                const end = Math.min(start + CONFIG.BATCH_SIZE, redeemLinks.length);
                const batchNum = batch + 1;

                console.log(`--- Batch ${batchNum}/${totalBatches} (tabs ${start + 1}-${end}) ---`);

                for (let i = start; i < end && !shouldStop; i++) {
                    GM_openInTab(redeemLinks[i], { active: false, insert: true });
                    opened++;
                    btn.textContent = `🎓 Batch ${batchNum}/${totalBatches}: ${opened}/${redeemLinks.length}`;
                    console.log(`Opened ${opened}/${redeemLinks.length}: ${redeemLinks[i]}`);

                    if (i < end - 1 && !shouldStop) {
                        const delay = randomDelay(CONFIG.MIN_DELAY_IN_BATCH, CONFIG.MAX_DELAY_IN_BATCH);
                        console.log(`Waiting ${(delay/1000).toFixed(1)}s before next tab...`);
                        await sleep(delay);
                    }
                }

                if (batch < totalBatches - 1 && !shouldStop) {
                    const batchPause = randomDelay(CONFIG.MIN_BATCH_PAUSE, CONFIG.MAX_BATCH_PAUSE);
                    console.log(`Batch ${batchNum} complete. Pausing ${(batchPause/1000).toFixed(0)}s before next batch...`);
                    btn.textContent = `⏸️ Pausing ${Math.round(batchPause/1000)}s... (${opened}/${redeemLinks.length})`;
                    btn.style.background = '#9c27b0';
                    await sleep(batchPause);
                    btn.style.background = '#ff9800';
                }
            }

            // Reset UI
            const wasStopped = shouldStop;
            isProcessing = false;
            shouldStop = false;
            stopBtn.style.display = 'none';
            btn.style.background = '#1a73e8';
            btn.disabled = false;

            // Update button with current count
            updateButtonVisibility();

            if (wasStopped) {
                console.log(`⏹️ Stopped! Opened ${opened}/${redeemLinks.length} links.`);
                alert(`Stopped! Opened ${opened} of ${redeemLinks.length} links.`);
            } else {
                console.log(`✅ Done! Opened ${redeemLinks.length} REDEEM OFFER links in ${totalBatches} batches.`);
                alert(`Done! Opened ${redeemLinks.length} links in ${totalBatches} batches.`);
            }
        };

        document.body.appendChild(btn);
        document.body.appendChild(stopBtn);

        // Initial visibility check
        updateButtonVisibility();
    }

    // Initialize
    setTimeout(addButton, 2000);

    // Watch for page changes (Gmail is a SPA)
    const observer = new MutationObserver(() => {
        setTimeout(() => {
            addButton();
            updateButtonVisibility();
        }, 1000);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also check periodically
    setInterval(updateButtonVisibility, 3000);
})();
