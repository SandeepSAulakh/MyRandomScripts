// ==UserScript==
// @name         YouTube Auto Remove Watched Videos
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Auto removes watched videos from Watch Later playlist
// @author       SandeepSAulakh
// @homepageURL  https://github.com/SandeepSAulakh/MyRandomScripts
// @supportURL   https://github.com/SandeepSAulakh/MyRandomScripts/issues
// @updateURL    https://raw.githubusercontent.com/SandeepSAulakh/MyRandomScripts/main/youtube/youtube-remove-watched.user.js
// @downloadURL  https://raw.githubusercontent.com/SandeepSAulakh/MyRandomScripts/main/youtube/youtube-remove-watched.user.js
// @match        https://www.youtube.com/playlist?list=WL*
// @match        https://www.youtube.com/playlist?list=WL
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    console.log('YouTube Auto Remove Watched script v1.5 loaded!');
    
    // Helper: Wait for element to appear
    function waitForElement(selectors, timeout = 5000) {
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
                    reject(new Error('Timeout'));
                    return;
                }
                
                setTimeout(check, 200);
            };
            
            check();
        });
    }

    async function removeWatchedVideos() {
        try {
            console.log('Looking for menu button...');
            
            // Step 1: Find and click the 3-dot menu button
            const menuButton = await waitForElement([
                'ytd-playlist-header-renderer ytd-menu-renderer yt-icon-button button',
                'ytd-playlist-header-renderer ytd-menu-renderer button',
                'ytd-playlist-header-renderer [aria-label="More actions"]',
                'ytd-menu-renderer yt-icon-button button'
            ]);
            
            console.log('Found menu button, clicking...');
            menuButton.click();
            
            // Step 2: Wait for menu and click "Remove watched videos"
            await new Promise(resolve => setTimeout(resolve, 800));
            
            console.log('Looking for Remove watched option...');
            
            // Try multiple selectors for the menu item
            const menuSelectors = [
                'tp-yt-paper-listbox ytd-menu-service-item-renderer',
                'tp-yt-paper-listbox tp-yt-paper-item',
                'ytd-menu-popup-renderer tp-yt-paper-item',
                'ytd-menu-service-item-renderer'
            ];
            
            let found = false;
            for (const selector of menuSelectors) {
                const items = document.querySelectorAll(selector);
                for (const item of items) {
                    if (item.textContent.toLowerCase().includes('remove watched')) {
                        console.log('Found "Remove watched videos", clicking...');
                        item.click();
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }
            
            if (!found) {
                // Fallback: try yt-formatted-string
                const allText = document.querySelectorAll('yt-formatted-string');
                for (const el of allText) {
                    if (el.textContent.toLowerCase().includes('remove watched')) {
                        const clickable = el.closest('tp-yt-paper-item') || el.closest('ytd-menu-service-item-renderer') || el;
                        clickable.click();
                        found = true;
                        break;
                    }
                }
            }
            
            if (!found) {
                console.log('Could not find "Remove watched videos" option');
                return;
            }
            
            // Step 3: Wait for confirmation dialog and click Remove
            console.log('Waiting for confirmation dialog...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // The confirm button based on your HTML:
            // button.yt-spec-button-shape-next--call-to-action with aria-label="Remove"
            const confirmSelectors = [
                // Primary: exact match from your HTML
                'button[aria-label="Remove"]',
                'button.yt-spec-button-shape-next--call-to-action[aria-label="Remove"]',
                'ytd-popup-container button[aria-label="Remove"]',
                'yt-button-shape button[aria-label="Remove"]',
                // Fallbacks
                'yt-confirm-dialog-renderer button[aria-label="Remove"]',
                'tp-yt-paper-dialog button[aria-label="Remove"]'
            ];
            
            let confirmBtn = null;
            
            // Try direct selectors first
            for (const selector of confirmSelectors) {
                confirmBtn = document.querySelector(selector);
                if (confirmBtn) {
                    console.log(`Found confirm button with selector: ${selector}`);
                    break;
                }
            }
            
            // Fallback: find by text content
            if (!confirmBtn) {
                console.log('Trying text-based search...');
                const allButtons = document.querySelectorAll('button.yt-spec-button-shape-next');
                for (const btn of allButtons) {
                    if (btn.textContent.trim().toLowerCase() === 'remove') {
                        confirmBtn = btn;
                        console.log('Found confirm button by text content');
                        break;
                    }
                }
            }
            
            if (confirmBtn) {
                console.log('Clicking confirm button...');
                confirmBtn.click();
                console.log('Done! Watched videos removed.');
            } else {
                console.log('Could not find confirm button.');
            }
            
        } catch (error) {
            console.log('Error:', error.message);
        }
    }
    
    // Wait for page to load then run
    setTimeout(removeWatchedVideos, 3000);
})();
