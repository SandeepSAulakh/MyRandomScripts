// ==UserScript==
// @name         Gmail Open All Udemy REDEEM OFFER Links
// @namespace    http://tampermonkey.net/
// @version      1.1
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

            btn.textContent = `🎓 Opening 0/${redeemLinks.length}...`;
            btn.disabled = true;

            // Open tabs with delay to avoid rate limiting
            const DELAY_BETWEEN_TABS = 8000; // 8 seconds between each tab

            for (let i = 0; i < redeemLinks.length; i++) {
                GM_openInTab(redeemLinks[i], { active: false, insert: true });
                btn.textContent = `🎓 Opening ${i + 1}/${redeemLinks.length}...`;
                console.log(`Opened ${i + 1}/${redeemLinks.length}: ${redeemLinks[i]}`);

                // Wait before opening next tab (except for last one)
                if (i < redeemLinks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TABS));
                }
            }

            btn.textContent = '🎓 Open All REDEEM OFFER';
            btn.disabled = false;
            console.log(`Opened ${redeemLinks.length} REDEEM OFFER links!`);
            alert(`Opened ${redeemLinks.length} REDEEM OFFER links!`);
        };
        
        document.body.appendChild(btn);
    }
    
    setTimeout(addButton, 2000);
    
    const observer = new MutationObserver(() => {
        setTimeout(addButton, 1000);
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
