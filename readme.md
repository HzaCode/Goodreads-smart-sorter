


Goodreads Smart Sorter<img src="https://github.com/HzaCode/goodreads-smart-sorter/blob/main/logo.jpg?raw=true" width="150" height="150" align="right" />
==================== 





[![Install Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-Install-orange)](https://chromewebstore.google.com/detail/goodreads-smart-sort/plmelbcjajggffbbmopjdaepijjkdmid?utm_source=item-share-cb)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Chrome Extension providing smarter, more nuanced sorting options for your Goodreads books, inspired by the kind of powerful sorting available on sites like IMDb.

## What it Does

Goodreads' standard sorting options primarily use simple metrics like average rating. This extension offers an alternative by adding a **weighted rating** sort option to your shelves. Inspired by the sorting principles used on platforms like IMDb, this method considers both a book's average score *and* its total number of ratings. The aim is to provide a more nuanced ranking that highlights books which are both well-regarded and have a significant number of reviews.


## Demo

See how easy it is to use in this short video:
[Watch Demo Video](https://github.com/user-attachments/assets/ab60011a-0679-4184-9b3f-b7952dbda3b9)

## How to Use

Using the Smart Sorter involves these steps:

1.  **Install the extension** from the [Chrome Web Store](https://chromewebstore.google.com/detail/goodreads-smart-sort/plmelbcjajggffbbmopjdaepijjkdmid?utm_source=item-share-cb).
2.  **Perform any book search** on the Goodreads website.
3.  On the search results page, **activate the Smart Sorter** (look for a button or icon added by the extension).
4.  **Select the number of search results** you wish to apply the smart sort to (e.g., sort the top 50, 100, etc., results displayed).
5.  The extension will then **automatically re-sort** the specified number of search results based on the weighted rating algorithm.
6.  View the search results, now ordered more effectively by a combination of rating and popularity!

*(The exact appearance/location of the activation button and quantity selection might differ slightly depending on the extension's design and Goodreads website updates).*

## How the Sorting Works (Algorithm Basics)

The "smart sort" uses a **weighted rating** formula, similar in principle to the one popularized by IMDb for ranking movies. This prevents books with very few high ratings from dominating lists and gives preference to books that are both highly rated *and* have a reasonable number of votes.

The formula balances the average rating (`R`) with the number of ratings (`v`), using a minimum rating threshold (`m`) and the overall mean rating (`C`) as parameters:

`Weighted Rating = (v / (v + m)) * R + (m / (v + m)) * C`

This approach provides a more statistically reliable way to rank books compared to simply sorting by the raw average rating. The specific values for `m` and `C` used in the extension are chosen to provide sensible results across typical Goodreads data.

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/HzaCode/goodreads-smart-sorter/issues).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 
