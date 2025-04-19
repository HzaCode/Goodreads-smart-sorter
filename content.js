// == START OF content.js ==
(async function() {
    'use strict';

    const MAX_PAGES = 100;
    const BOOKS_PER_PAGE = 20;
    const FETCH_MAX_BOOKS_INDICATOR = Infinity;
    const PRESET_OPTIONS = [50, 100, 500, 1000];
    const FETCH_DELAY_MS = 250;
    const M_DYNAMIC_BASELINE = 500;
    const M_MINIMUM_VALUE = 50;

    const USE_FIXED_M = false;
    const M_FIXED_VALUE = 1000;

    const ENABLE_DEBUG_LOG = true;

    function logDebug(message, ...args) {
        if (ENABLE_DEBUG_LOG) {
            console.log("[GoodreadsSort]", message, ...args);
        }
    }

    function bayesianWeightedRating(rating, reviews, avgRating, M) {
        if (reviews + M === 0) {
            logDebug("Warning: reviews + M is zero in bayesianWeightedRating. Returning avgRating.", {rating, reviews, avgRating, M});
            return avgRating;
        }
        const validRating = !isNaN(rating) ? rating : 0;
        const validReviews = !isNaN(reviews) ? reviews : 0;
        return (validReviews / (validReviews + M)) * validRating + (M / (validReviews + M)) * avgRating;
    }

    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                return resolve(element);
            }
            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    clearTimeout(timer);
                    resolve(element);
                }
            });
            const timer = setTimeout(() => {
                observer.disconnect();
                logDebug(`Error: Timed out waiting for element "${selector}" after ${timeout}ms`);
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }, timeout);
            observer.observe(document.body, { childList: true, subtree: true });
            logDebug(`Waiting for element: "${selector}"`);
        });
    }

    function extractRatingInfo(element) {
        const minirating = element.querySelector('.minirating');
        if (!minirating) return { rating: NaN, reviews: NaN };
        const text = minirating.textContent.trim();
        let rating = NaN, reviews = NaN;
        const ratingMatch = text.match(/(\d+(?:[.,]\d+)?)\s+avg rating/i);
        if (ratingMatch && ratingMatch[1]) {
             rating = parseFloat(ratingMatch[1].replace(',', '.'));
        }
        const reviewsMatch = text.match(/(?:—|-|–)\s*([\d,]+)\s+ratings?/i);
        if (reviewsMatch && reviewsMatch[1]) {
            reviews = parseInt(reviewsMatch[1].replace(/,/g, ''), 10);
        }
        return { rating, reviews };
    }

    function createBookElement(book) {
        const bookDiv = document.createElement('div');
        bookDiv.className = 'book-item';
        const coverImg = book.clonedElement?.querySelector('img');
        const authorLink = book.clonedElement?.querySelector('.authorName span[itemprop="name"]') || book.clonedElement?.querySelector('.authorName');
        const authorName = authorLink ? authorLink.textContent.trim() : 'Unknown Author';
        const titleLink = book.clonedElement?.querySelector('a.bookTitle span[itemprop="name"]') || book.clonedElement?.querySelector('a.bookTitle');
        const bookTitleText = titleLink ? titleLink.textContent.trim() : book.title || 'Unknown Title';
        const weightedScoreDisplay = !isNaN(book.weighted_score) ? book.weighted_score.toFixed(2) : 'N/A';

        bookDiv.innerHTML = `
            <div class="book-cover">
                ${coverImg ? coverImg.outerHTML : '<div style="width:80px; height: 120px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; text-align: center; font-size:10px; color: #aaa; border: 1px solid #eee;">No Cover</div>'}
            </div>
            <div class="book-info">
                <div class="book-title">${bookTitleText}</div>
                <div class="book-author">by ${authorName}</div>
                <div class="book-rating">
                    Rating: ${!isNaN(book.rating) ? book.rating.toFixed(2) : 'N/A'} (${!isNaN(book.reviews) ? book.reviews.toLocaleString() : '0'} ratings)
                    <span class="score-badge">Score: ${weightedScoreDisplay}</span>
                </div>
            </div>
        `;
        return bookDiv;
    }

     function extractBooksFromDocument(doc) {
        const bookElements = doc.querySelectorAll('table.tableList tr[itemtype="http://schema.org/Book"]');
        logDebug(`Found ${bookElements.length} potential book elements on page.`);
        const books = [];
        bookElements.forEach((el, index) => {
            const titleElement = el.querySelector('a.bookTitle span[itemprop="name"]') || el.querySelector('a.bookTitle');
            const title = titleElement ? titleElement.innerText.trim() : `Unknown Title ${index}`;
            const { rating, reviews } = extractRatingInfo(el);
            if (!isNaN(rating) && !isNaN(reviews)) {
                books.push({
                    clonedElement: el.cloneNode(true),
                    title, rating, reviews
                });
            } else {
                logDebug(`Skipping book "${title}" due to invalid rating/reviews:`, { rating, reviews });
            }
        });
        logDebug(`Extracted ${books.length} valid books from page.`);
        return books;
    }

    async function fetchPage(url) {
        logDebug("Fetching page:", url);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                 logDebug(`HTTP error fetching page ${url}: Status ${response.status}`);
                return null;
            }
            const contentType = response.headers.get("content-type");
             if (!contentType || !contentType.includes("text/html")) {
                 logDebug(`Warning: Fetched page ${url} has unexpected Content-Type: ${contentType}`);
             }
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
             if (!doc.querySelector('table.tableList') && !doc.querySelector('.leftContainer')) {
                 logDebug(`Warning: Fetched page ${url} content seems invalid or empty after parsing.`);
             }
            return doc;
        } catch (error) {
            console.error("Network or parsing error fetching page:", url, error);
            return null;
        }
    }

    function getNextPageUrl(doc) {
        if (!doc) return null;
        const nextLinkRel = doc.querySelector('link[rel="next"]');
        if (nextLinkRel && nextLinkRel.href) {
            logDebug("Found next page URL via link[rel=next]:", nextLinkRel.href);
            return nextLinkRel.href;
        }
        const nextLinkA = doc.querySelector('a.next_page');
         if (nextLinkA && nextLinkA.href) {
            logDebug("Found next page URL via a.next_page:", nextLinkA.href);
            return new URL(nextLinkA.href, doc.baseURI).href;
        }
        logDebug("No next page URL found.");
        return null;
    }

     function percentile(arr, p) {
        if (!arr || arr.length === 0) return 0;
        const sorted = arr.filter(x => !isNaN(x) && x > 0).sort((a, b) => a - b);
         if (sorted.length === 0) return 0;
        const percentileP = Math.max(0, Math.min(1, p));

        const index = Math.min(sorted.length - 1, Math.floor(percentileP * (sorted.length -1)));
        return sorted[index] || 0;
    }


    function createSortedPage(books, M, isMFixed, totalFetched, targetBooks) {
        logDebug("Creating sorted page...");
        const booksToProcess = books.filter(b => !isNaN(b.rating) && !isNaN(b.reviews));
        if (booksToProcess.length === 0) {
             logDebug("No valid books to process for sorting.");
             alert("No valid book data found to sort.");
             return;
        }

        const totalRatings = booksToProcess.reduce((sum, b) => sum + b.rating, 0);
        const avgRating = totalRatings / booksToProcess.length;
        logDebug(`Calculating weighted scores with M=${M}, AvgRating=${avgRating.toFixed(2)} for ${booksToProcess.length} books.`);

        booksToProcess.forEach(book => {
            book.weighted_score = bayesianWeightedRating(book.rating, book.reviews, avgRating, M);
        });

        booksToProcess.sort((a, b) => {
             const scoreA = isNaN(a.weighted_score) ? -Infinity : a.weighted_score;
             const scoreB = isNaN(b.weighted_score) ? -Infinity : b.weighted_score;
             return scoreB - scoreA;
        });

        try {
            const oldContainer = document.querySelector('.book-container');
            if (oldContainer) oldContainer.remove();
            const oldSortInfo = document.querySelector('.sort-info');
            if (oldSortInfo) oldSortInfo.remove();

            const container = document.createElement('div');
            container.className = 'book-container';

            const sortInfo = document.createElement('div');
            sortInfo.className = 'sort-info';
            const mType = isMFixed ? `Fixed (${M_FIXED_VALUE})` : `Dynamic (75th perc. & base ${M_DYNAMIC_BASELINE})`;
            const displayTarget = targetBooks === FETCH_MAX_BOOKS_INDICATOR ? `Max (~${(MAX_PAGES * BOOKS_PER_PAGE).toLocaleString()})` : targetBooks.toLocaleString();
            sortInfo.innerHTML = `
                <strong>Sorted by Bayesian Score</strong><br>
                M = ${M.toFixed(0)} (${mType})<br>
                Sample Avg Rating: ${avgRating.toFixed(2)}<br>
                Target Books: ${displayTarget}<br>
                Processed Books: ${booksToProcess.length.toLocaleString()} (of ${totalFetched.toLocaleString()} fetched)
            `;
            document.body.appendChild(sortInfo);

            booksToProcess.forEach(book => {
                const bookElement = createBookElement(book);
                container.appendChild(bookElement);
            });

            const originalContentParent = document.querySelector('.leftContainer');
            const originalTable = document.querySelector('table.tableList');
            if (originalTable && originalTable.parentNode) {
                logDebug("Replacing original table.tableList with sorted list.");
                originalTable.parentNode.replaceChild(container, originalTable);
            } else if (originalContentParent) {
                logDebug("Original table.tableList not found. Appending sorted list to .leftContainer.");
                const existingContainer = originalContentParent.querySelector('.book-container');
                if(existingContainer) existingContainer.remove();
                originalContentParent.appendChild(container);
            } else {
                logDebug("Warning: Could not find .leftContainer. Appending sorted list directly to body.");
                document.body.appendChild(container);
            }
            logDebug("Sorted page created successfully.");
        } catch (error) {
            console.error("Error updating the DOM with sorted results:", error);
            alert("An error occurred while displaying the sorted results. Please check the console (F12).");
        }
    }

    function addStyles() {
        if (document.getElementById('goodreads-sort-styles')) {
            logDebug("Styles already added.");
            return;
        }
        logDebug("Adding styles...");
        const styles = `

            .book-container *, .sort-info *, .book-fetch-panel *, .fetch-progress-container * { box-sizing: border-box; }


            .sort-info {
                position: fixed; top: 60px; right: 15px;
                background: rgba(253, 251, 245, 0.97);
                padding: 12px 15px; border-radius: 8px;
                box-shadow: 0 3px 8px rgba(80,60,40,0.15);
                z-index: 9998; font-family: Georgia, serif;
                font-size: 12px; color: #443; max-width: 260px; line-height: 1.5;
                border: 1px solid #e5e0d4;
            }
            .sort-info strong { font-weight: 600; color: #000; }



            .book-container {
                margin: 20px 0; padding: 10px; background: white;
                border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.1);
                border: 1px solid #e0e0e0;
            }


            .book-item {
                display: flex; align-items: flex-start;
                padding: 15px 10px; border-bottom: 1px solid #eee; gap: 15px;
            }
            .book-item:last-child { border-bottom: none; }


            .book-cover { width: 80px; flex-shrink: 0; }
            .book-cover img { width: 100%; height: auto; display: block; border: 1px solid #f0f0f0; }
            .book-cover div {
                width: 80px; height: 120px; background: #f5f5f5;
                display: flex; align-items: center; justify-content: center;
                text-align: center; font-size: 10px; color: #aaa; border: 1px solid #eee;
             }


            .book-info { flex: 1; min-width: 0; }
            .book-title {
                font-size: 15px; font-weight: bold; color: #111; margin-bottom: 4px;
                line-height: 1.3;
            }
            .book-author { color: #555; font-size: 13px; margin-bottom: 6px; }
            .book-rating { color: #666; font-size: 12px; }


            .score-badge {
                display: inline-block; background: rgba(64, 157, 105, 0.9); color: white;
                padding: 3px 8px; border-radius: 12px; font-size: 11px;
                font-weight: bold; margin-left: 8px; vertical-align: middle;
            }


            .book-fetch-panel {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: #fff; border-radius: 12px; box-shadow: 0 5px 20px rgba(0,0,0,0.2);
                padding: 25px 30px; z-index: 9999; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                color: #333; max-width: 380px; text-align: center; border: 1px solid #ccc;
            }
            .book-fetch-panel h2 { margin-top: 0; font-size: 18px; margin-bottom: 15px; font-weight: 600; }
            .book-fetch-options { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-bottom: 15px; }
            .book-fetch-button, .fetch-max-button {
                border: none; border-radius: 6px; padding: 9px 14px; cursor: pointer;
                font-size: 14px; font-weight: 500; transition: all 0.2s ease;
            }
            .book-fetch-button {
                 background: #e8f4ec; color: #3a7a52; border: 1px solid #c1e0cc;
            }
            .book-fetch-button:hover { background: #d1ecd9; border-color: #a8d3b7; }
            .fetch-max-button {
                 background: #fff3e0; color: #b87010; border: 1px solid #ffdcb2;
                 margin-top: 10px; display: block; width: 90%; margin-left: auto; margin-right: auto;
                 font-weight: bold;
             }
            .fetch-max-button:hover { background: #ffe8cc; border-color: #ffcfa0; }
            .book-fetch-hint {
                font-size: 11.5px; color: #555; margin-top: 20px; line-height: 1.5;
                text-align: left; background: #f9f9f9; padding: 12px; border-radius: 6px;
                border: 1px solid #eee;
            }
             .book-fetch-hint strong { font-weight: 600; color: #222; }



            .fetch-progress-container {
                position: fixed;
                top: 50px;
                left: 0; width: 100%;
                background: #fdfbf5;
                height: 34px;
                z-index: 10000; display: flex; align-items: center;
                padding: 0 15px; font-family: Georgia, serif;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                border-bottom: 1px solid #e5e0d4;
            }
            .fetch-progress-bar-wrap {
                flex: 1;
                background: linear-gradient(to bottom, #e0d6c6, #d3c8b8);
                height: 18px;
                border-radius: 3px;
                margin-right: 15px; overflow: hidden;
                border: 1px solid #bfae98;
                box-shadow: inset 0 1px 3px rgba(0,0,0,0.15);
            }
            .fetch-progress-bar {
                height: 100%; width: 0%;
                border-radius: 2px;
                background-color: #a0d2db;
                background-image: repeating-linear-gradient(
                    -45deg,
                    #b22222 0px, #b22222 12px,
                    #4682b4 12px, #4682b4 24px,
                    #2e8b57 24px, #2e8b57 36px,
                    #daa520 36px, #daa520 48px,
                    #708090 48px, #708090 60px
                );
                background-size: 85px 85px;
                transition: width 0.4s cubic-bezier(0.65, 0, 0.35, 1);
                animation: book-shimmer 2s linear infinite;
                box-shadow: inset 0 -1px 2px rgba(0,0,0,0.2);
            }


            @keyframes book-shimmer {
                0% { background-position: 0% 0%; }
                100% { background-position: 85px 0; }
            }

            .fetch-progress-text {
                font-size: 13px; color: #5a4a3b;
                font-weight: bold; min-width: 180px;
                text-align: right; white-space: nowrap;
                text-shadow: 0 1px 0 rgba(255,255,255,0.6);
            }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.id = 'goodreads-sort-styles';
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);
        logDebug("Styles added successfully (with fun progress bar!).");
    }

     function createProgressBar() {
        const oldProgress = document.querySelector('.fetch-progress-container');
        if (oldProgress) oldProgress.remove();
        logDebug("Creating progress bar...");
        const container = document.createElement('div');
        container.className = 'fetch-progress-container';
        const barWrap = document.createElement('div');
        barWrap.className = 'fetch-progress-bar-wrap';
        const bar = document.createElement('div');
        bar.className = 'fetch-progress-bar';
        barWrap.appendChild(bar);
        const text = document.createElement('div');
        text.className = 'fetch-progress-text';
        text.innerText = "Initializing...";
        container.appendChild(barWrap);
        container.appendChild(text);

        if(document.body) {
             document.body.insertBefore(container, document.body.firstChild);
        } else {
             console.error("Cannot create progress bar: document.body not ready.");

        }

        return { bar, text, container };
    }


    function updateProgressBar(barElem, textElem, current, target, page, maxPages, isFetchMax) {
        let percentage = 0;
        let text = 'Processing...';
        try {
            if (isFetchMax) {
                percentage = (page / maxPages) * 100;
                text = `Fetched ${current.toLocaleString()} books (Page ${page}/${maxPages})...`;
            } else {
                 const targetNum = (target === Infinity) ? 0 : target;
                 if (targetNum > 0) { percentage = (current / targetNum) * 100; }
                 else if (current > 0) { percentage = 100; }
                 else { percentage = 0; }
                const targetDisplay = target === Infinity ? 'Max' : target.toLocaleString();
                text = `Fetched ${current.toLocaleString()}/${targetDisplay} books (Page ${page})...`;
            }
            percentage = Math.min(Math.max(percentage, 0), 100);
            barElem.style.width = percentage.toFixed(1) + '%';
            textElem.innerText = text;
        } catch (e) {
             console.error("Error updating progress bar:", e);
             textElem.innerText = "Error updating progress...";
        }
    }

    function createOptionPanel(options) {
        const oldPanel = document.querySelector('.book-fetch-panel');
        if (oldPanel) oldPanel.remove();
        logDebug("Creating options panel...");

        const panel = document.createElement('div');
        panel.className = 'book-fetch-panel';

        const title = document.createElement('h2');
        title.innerText = "Configure Smart Sort";
        panel.appendChild(title);

        const optionContainer = document.createElement('div');
        optionContainer.className = 'book-fetch-options';

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'book-fetch-button';
            btn.innerText = opt.toLocaleString();
            btn.dataset.count = opt;
            btn.addEventListener('click', handleOptionClick);
            optionContainer.appendChild(btn);
        });
        panel.appendChild(optionContainer);

        const maxBtn = document.createElement('button');
        maxBtn.className = 'fetch-max-button';
        maxBtn.innerText = `Fetch Max (~${(MAX_PAGES * BOOKS_PER_PAGE).toLocaleString()} books)`;
        maxBtn.dataset.count = FETCH_MAX_BOOKS_INDICATOR.toString();
        maxBtn.addEventListener('click', handleOptionClick);
        panel.appendChild(maxBtn);

        const hint = document.createElement('div');
        hint.className = 'book-fetch-hint';
        const mDescription = USE_FIXED_M
            ? `Using <strong>Fixed M = ${M_FIXED_VALUE}</strong> for ranking.`
            : `Using <strong>Dynamic M</strong> (based on 75th percentile & baseline ${M_DYNAMIC_BASELINE}) for ranking.`;
        hint.innerHTML = `Select number of books to fetch for sorting:<br>
            - More books = <strong>more accurate ranking</strong>, but <strong>longer wait time</strong>.<br>
            - 'Fetch Max' tries up to ${MAX_PAGES} pages for best accuracy, but can be slow & may be stopped by Goodreads.<br>
            - Recommended: <strong>500</strong> or <strong>1,000</strong> for a good balance.<br><br>
            ${mDescription}`;
        panel.appendChild(hint);

        document.body.appendChild(panel);
        logDebug("Options panel created.");
    }

    function handleOptionClick(event) {
         logDebug("Option button clicked:", event.target.innerText);
        const countStr = event.target.dataset.count;
        let count;
        if (countStr === FETCH_MAX_BOOKS_INDICATOR.toString()) {
            count = FETCH_MAX_BOOKS_INDICATOR;
        } else {
            count = parseInt(countStr, 10);
        }
        if (!isNaN(count)) {
             const panel = document.querySelector('.book-fetch-panel');
             if (panel) panel.remove();
            logDebug(`Starting fetch with count: ${count === FETCH_MAX_BOOKS_INDICATOR ? 'Max' : count}`);
            startFetch(count);
        } else {
             console.error("Invalid book count selected:", countStr);
             alert("Invalid number selected.");
        }
    }

    async function startFetch(requestedCount) {
        const isFetchMax = (requestedCount === FETCH_MAX_BOOKS_INDICATOR);
        const userMaxBooks = isFetchMax ? Infinity : requestedCount;
        const progressBarTarget = isFetchMax ? (MAX_PAGES * BOOKS_PER_PAGE) : requestedCount;
        const { bar, text, container: progressContainer } = createProgressBar();

        let allBooks = [];
        let nextPageUrl = '';
        let pageCount = 0;
        let totalFetched = 0;
        let stoppedEarly = false;

        try {
            logDebug("Processing initial page (Page 1)...");
            pageCount = 1;
            const initialBooks = extractBooksFromDocument(document);
            if (initialBooks.length > 0) {
                allBooks = allBooks.concat(initialBooks);
                totalFetched = allBooks.length;
                logDebug(`Found ${totalFetched} books on initial page.`);
            } else {
                logDebug("No valid books found on initial page.");
            }
            nextPageUrl = getNextPageUrl(document);
            updateProgressBar(bar, text, totalFetched, progressBarTarget, pageCount, MAX_PAGES, isFetchMax);

             if (!isFetchMax && totalFetched >= userMaxBooks) {
                 logDebug("Initial page books already meet target. Skipping further fetches.");
                 nextPageUrl = null;
             }

            while (nextPageUrl && pageCount < MAX_PAGES && (isFetchMax || totalFetched < userMaxBooks)) {
                pageCount++;
                logDebug(`Fetching page ${pageCount}: ${nextPageUrl}`);
                updateProgressBar(bar, text, totalFetched, progressBarTarget, pageCount, MAX_PAGES, isFetchMax);

                const doc = await fetchPage(nextPageUrl);

                if (doc) {
                    const booksOnPage = extractBooksFromDocument(doc);
                    if (booksOnPage.length === 0) {
                        logDebug(`Page ${pageCount} contained 0 valid books or fetch failed. Stopping fetch.`);
                        stoppedEarly = true; break;
                    }
                    allBooks = allBooks.concat(booksOnPage);
                    totalFetched = allBooks.length;
                    nextPageUrl = getNextPageUrl(doc);
                    logDebug(`Fetched page ${pageCount}. Books: ${booksOnPage.length}. Total: ${totalFetched}. Next URL: ${nextPageUrl || 'None'}`);
                    updateProgressBar(bar, text, totalFetched, progressBarTarget, pageCount, MAX_PAGES, isFetchMax);

                     if (!isFetchMax && totalFetched >= userMaxBooks) {
                          logDebug(`Reached target book count (${userMaxBooks}). Stopping fetch.`); break;
                     }
                } else {
                    logDebug(`Failed to fetch or process page ${pageCount}. Stopping fetch.`);
                    nextPageUrl = null; stoppedEarly = true; break;
                }
                await new Promise(resolve => setTimeout(resolve, FETCH_DELAY_MS));
            }

            logDebug(`Fetch loop finished. Pages: ${pageCount}. Fetched: ${totalFetched}. Stopped early: ${stoppedEarly}`);

            if (!isFetchMax && allBooks.length > userMaxBooks) {
                logDebug(`Trimming book list from ${allBooks.length} to ${userMaxBooks}.`);
                allBooks = allBooks.slice(0, userMaxBooks);
                totalFetched = allBooks.length;
            }

             progressContainer?.remove();


            let M;
            let isMFixed;
            if (USE_FIXED_M) {
                M = M_FIXED_VALUE; isMFixed = true;
                logDebug(`Using fixed M value: ${M}`);
            } else {
                const reviewsArray = allBooks.map(b => b.reviews).filter(r => !isNaN(r) && r > 0);
                let q75Reviews = 0;
                if (reviewsArray.length > 0) {
                    q75Reviews = percentile(reviewsArray, 0.75);
                    logDebug(`Calculated 75th percentile of reviews: ${q75Reviews}`);
                } else { logDebug("No valid reviews found to calculate 75th percentile."); }
                M = Math.max(M_MINIMUM_VALUE, M_DYNAMIC_BASELINE, q75Reviews);
                isMFixed = false;
                logDebug(`Using dynamic M. Baseline: ${M_DYNAMIC_BASELINE}, 75th perc: ${q75Reviews}, Min: ${M_MINIMUM_VALUE}. Final M: ${M}`);
            }


            if (allBooks.length > 0) {
                createSortedPage(allBooks, M, isMFixed, totalFetched, requestedCount);
            } else {
                logDebug("No books found or fetched. Nothing to sort.");
                alert("No valid books were found or fetched. Cannot perform sorting.");
            }
        } catch (error) {
            console.error("Error during fetch process:", error);
            alert("An unexpected error occurred during the fetching process. Please check the console (F12).");
             progressContainer?.remove();
        }
    }

    function init() {
        logDebug("Initializing script...");
        try {
            if (!document.body) {
                 logDebug("Document body not ready yet. Waiting...");
                 window.addEventListener('DOMContentLoaded', init);
                 return;
            }
            addStyles();
            createTriggerButton();
            logDebug("Initialization complete. Trigger button added.");
        } catch (error) {
            console.error("Error during initialization:", error);
            alert("Error initializing the Goodreads Sort extension. Please check the console (F12).");
        }
    }

    function createTriggerButton() {
        const buttonId = 'goodreads-sort-trigger-button';
        if (document.getElementById(buttonId)) {
            logDebug("Trigger button already exists.");
            return;
        }
        logDebug("Creating trigger button...");

        const button = document.createElement('button');
        button.id = buttonId;
        button.innerText = "Smart Sort Books";
         Object.assign(button.style, {
             position: 'fixed', top: '10px', right: '10px', zIndex: '10001',
             backgroundColor: '#409d69', color: '#fff', border: 'none',
             borderRadius: '6px', padding: '10px 16px', cursor: 'pointer',
             fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
             fontSize: '14px', fontWeight: '600', boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
             lineHeight: '1'
         });
         let originalColor = button.style.backgroundColor;
         button.addEventListener('mouseover', () => button.style.backgroundColor = '#368b5a');
         button.addEventListener('mouseout', () => button.style.backgroundColor = originalColor);

        button.addEventListener('click', () => {
             logDebug("Trigger button clicked.");
            createOptionPanel(PRESET_OPTIONS);
        });

        if (document.body) {
             document.body.appendChild(button);
             logDebug("Trigger button appended to body.");
        } else {
             console.error("Cannot append trigger button: document.body is not available yet.");
             document.addEventListener('DOMContentLoaded', () => {
                 if (!document.getElementById(buttonId)) {
                     document.body.appendChild(button);
                     logDebug("Trigger button appended to body after DOMContentLoaded.");
                 }
             });
        }
    }


    logDebug("Script evaluating. Document readyState:", document.readyState);
    if (document.readyState === 'loading') {
        logDebug("DOM not ready, adding DOMContentLoaded listener.");
        document.addEventListener('DOMContentLoaded', init);
    } else {
        logDebug("DOM already ready or interactive, running init.");

        setTimeout(init, 0);

    }

})();
// == END OF content.js ==