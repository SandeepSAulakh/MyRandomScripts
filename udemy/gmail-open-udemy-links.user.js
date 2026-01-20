// ==UserScript==
// @name         Gmail Open All Udemy REDEEM OFFER Links
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Adds a button to open all REDEEM OFFER links in new tabs
// @match        https://mail.google.com/mail/*
// @run-at       document-idle
// @grant        GM_openInTab
// ==/UserScript==

(function() {
    'use strict';
    
    // Add a floating button
    function addButton() {
        if (document.getElementById('redeem-all-btn')) return;
        
        const btn = document.createElement('button');
        btn.id = 'redeem-all-btn';
        btn.textContent = '🎓 Open All REDEEM OFFER';
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            padding: 12px 20px;
            background: #1a73e8;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        
        btn.onclick = async function() {
            const links = document.querySelectorAll('a');
            const redeemLinks = [];

            for (const link of links) {
                if (link.textContent.trim() === 'REDEEM OFFER') {
                    redeemLinks.push(link.href);
                }
            }

            if (redeemLinks.length === 0) {
                alert('No REDEEM OFFER links found!');
                return;
            }

            // Configuration
            const CONFIG = {
                BATCH_SIZE: 5,              // Tabs per batch
                MIN_DELAY_IN_BATCH: 3000,   // 3-6 sec between tabs in same batch
                MAX_DELAY_IN_BATCH: 6000,
                MIN_BATCH_PAUSE: 30000,     // 30-45 sec pause between batches
                MAX_BATCH_PAUSE: 45000
            };

            const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            btn.textContent = `🎓 Opening 0/${redeemLinks.length}...`;
            btn.disabled = true;
            btn.style.background = '#ff9800'; // Orange while processing

            let opened = 0;
            const totalBatches = Math.ceil(redeemLinks.length / CONFIG.BATCH_SIZE);

            for (let batch = 0; batch < totalBatches; batch++) {
                const start = batch * CONFIG.BATCH_SIZE;
                const end = Math.min(start + CONFIG.BATCH_SIZE, redeemLinks.length);
                const batchNum = batch + 1;

                console.log(`--- Batch ${batchNum}/${totalBatches} (tabs ${start + 1}-${end}) ---`);

                // Open tabs in this batch
                for (let i = start; i < end; i++) {
                    GM_openInTab(redeemLinks[i], { active: false, insert: true });
                    opened++;
                    btn.textContent = `🎓 Batch ${batchNum}/${totalBatches}: ${opened}/${redeemLinks.length}`;
                    console.log(`Opened ${opened}/${redeemLinks.length}: ${redeemLinks[i]}`);

                    // Random delay between tabs in same batch (except last in batch)
                    if (i < end - 1) {
                        const delay = randomDelay(CONFIG.MIN_DELAY_IN_BATCH, CONFIG.MAX_DELAY_IN_BATCH);
                        console.log(`Waiting ${(delay/1000).toFixed(1)}s before next tab...`);
                        await sleep(delay);
                    }
                }

                // Longer pause between batches (except after last batch)
                if (batch < totalBatches - 1) {
                    const batchPause = randomDelay(CONFIG.MIN_BATCH_PAUSE, CONFIG.MAX_BATCH_PAUSE);
                    console.log(`Batch ${batchNum} complete. Pausing ${(batchPause/1000).toFixed(0)}s before next batch...`);
                    btn.textContent = `⏸️ Pausing ${Math.round(batchPause/1000)}s... (${opened}/${redeemLinks.length})`;
                    btn.style.background = '#9c27b0'; // Purple during pause
                    await sleep(batchPause);
                    btn.style.background = '#ff9800'; // Back to orange
                }
            }

            btn.textContent = '🎓 Open All REDEEM OFFER';
            btn.style.background = '#1a73e8'; // Back to blue
            btn.disabled = false;
            console.log(`✅ Done! Opened ${redeemLinks.length} REDEEM OFFER links in ${totalBatches} batches.`);
            alert(`Done! Opened ${redeemLinks.length} links in ${totalBatches} batches.`);
        };
        
        document.body.appendChild(btn);
    }
    
    setTimeout(addButton, 2000);
    
    const observer = new MutationObserver(() => {
        setTimeout(addButton, 1000);
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
