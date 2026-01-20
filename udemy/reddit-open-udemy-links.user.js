// ==UserScript==
// @name         Reddit Open All Udemy REDEEM OFFER Links
// @namespace    http://tampermonkey.net/
// @version      1.0.4
// @description  Adds a button to open all idownloadcoupon.com REDEEM OFFER links in new tabs with batch processing
// @author       SandeepSAulakh
// @homepageURL  https://github.com/SandeepSAulakh/MyRandomScripts
// @supportURL   https://github.com/SandeepSAulakh/MyRandomScripts/issues
// @updateURL    https://raw.githubusercontent.com/SandeepSAulakh/MyRandomScripts/main/udemy/reddit-open-udemy-links.user.js
// @downloadURL  https://raw.githubusercontent.com/SandeepSAulakh/MyRandomScripts/main/udemy/reddit-open-udemy-links.user.js
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://new.reddit.com/*
// @run-at       document-idle
// @grant        GM_openInTab
// ==/UserScript==

(function() {
    'use strict';

    // Global state for stop functionality
    let isProcessing = false;
    let shouldStop = false;

    // Configuration
    const CONFIG = {
        // Tabs per batch
        BATCH_SIZE: 5,
        // 2-4 sec between tabs in same batch
        MIN_DELAY_IN_BATCH: 2000,
        MAX_DELAY_IN_BATCH: 4000,
        // 10-15 sec pause between batches
        MIN_BATCH_PAUSE: 10000,
        MAX_BATCH_PAUSE: 15000
    };

    const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    // Interruptible sleep - checks shouldStop flag
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

    // Find all REDEEM OFFER links pointing to idownloadcoupon.com
    function findRedeemLinks() {
        const links = document.querySelectorAll('a');
        const redeemLinks = [];

        for (const link of links) {
            const text = link.textContent.trim().toUpperCase();
            const href = link.href || '';

            // Check if text contains "REDEEM OFFER" and link goes to idownloadcoupon.com
            if (text.includes('REDEEM OFFER') && href.includes('idownloadcoupon.com')) {
                redeemLinks.push(href);
            }
        }

        // Remove duplicates
        return [...new Set(redeemLinks)];
    }

    // Update button visibility based on links found
    function updateButtonVisibility() {
        const btn = document.getElementById('reddit-redeem-btn');
        const stopBtn = document.getElementById('reddit-stop-btn');

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
    function addButtons() {
        if (document.getElementById('reddit-redeem-btn')) return;

        // Main button (hidden by default)
        const btn = document.createElement('button');
        btn.id = 'reddit-redeem-btn';
        btn.textContent = '🎓 Open REDEEM OFFER';
        btn.style.cssText = `
            position: fixed !important;
            bottom: 150px !important;
            right: 20px !important;
            z-index: 99999 !important;
            padding: 12px 20px !important;
            background: #ff4500 !important;
            color: white !important;
            border: none !important;
            border-radius: 8px !important;
            font-size: 14px !important;
            font-weight: bold !important;
            cursor: pointer !important;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3) !important;
            white-space: nowrap !important;
            min-width: 250px !important;
            width: auto !important;
            overflow: visible !important;
            text-overflow: clip !important;
        `;

        // Stop button (hidden by default)
        const stopBtn = document.createElement('button');
        stopBtn.id = 'reddit-stop-btn';
        stopBtn.textContent = '⛔ STOP';
        stopBtn.style.cssText = `
            position: fixed;
            bottom: 150px;
            right: 250px;
            z-index: 99999;
            padding: 12px 20px;
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            display: none;
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
                alert('No REDEEM OFFER links from idownloadcoupon.com found!');
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

                // Open tabs in this batch
                for (let i = start; i < end && !shouldStop; i++) {
                    GM_openInTab(redeemLinks[i], { active: false, insert: true });
                    opened++;
                    btn.textContent = `🎓 Batch ${batchNum}/${totalBatches}: ${opened}/${redeemLinks.length}`;
                    console.log(`Opened ${opened}/${redeemLinks.length}: ${redeemLinks[i]}`);

                    // Random delay between tabs in same batch (except last in batch)
                    if (i < end - 1 && !shouldStop) {
                        const delay = randomDelay(CONFIG.MIN_DELAY_IN_BATCH, CONFIG.MAX_DELAY_IN_BATCH);
                        console.log(`Waiting ${(delay/1000).toFixed(1)}s before next tab...`);
                        await sleep(delay);
                    }
                }

                // Pause between batches (except after last batch)
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
            btn.style.background = '#ff4500';
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
    console.log('Reddit REDEEM OFFER script v1.0.4 loaded!');

    // Wait for page to load then add buttons
    setTimeout(addButtons, 2000);

    // Watch for page changes (Reddit is a SPA)
    const observer = new MutationObserver(() => {
        setTimeout(() => {
            addButtons();
            updateButtonVisibility();
        }, 1000);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also check periodically (Reddit loads content dynamically)
    setInterval(updateButtonVisibility, 3000);
})();
