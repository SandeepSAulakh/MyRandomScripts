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
        
        btn.onclick = function() {
            const links = document.querySelectorAll('a');
            let count = 0;
            
            for (const link of links) {
                if (link.textContent.trim() === 'REDEEM OFFER') {
                    const url = link.href;
                    GM_openInTab(url, { active: false, insert: true });
                    count++;
                }
            }
            
            console.log(`Opened ${count} REDEEM OFFER links!`);
            alert(`Opened ${count} REDEEM OFFER links in background!`);
        };
        
        document.body.appendChild(btn);
    }
    
    setTimeout(addButton, 2000);
    
    const observer = new MutationObserver(() => {
        setTimeout(addButton, 1000);
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
