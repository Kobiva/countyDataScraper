///to be entered into the terminal while VcXsrv is actuated to be able to give code access to chromium.///
// 1  export DISPLAY=:0 # in WSL 1
// 2  export DISPLAY=$(awk '/nameserver / {print $2; exit}' /etc/resolv.conf 2>/dev/null):0 # in WSL 2
// 3  export LIBGL_ALWAYS_INDIRECT=1

const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const mongoose = require("mongoose");
const Listing = require("./model/Listing");
const date = new Date();
const day = date.getDate();
const lastWeek = day - 7;
const month = date.getMonth() + 1;
const year = date.getFullYear();
const currentDate = `${month}/${day}/${year}`;

// calculate last week's date
let lastWeeksDate;
  if (lastWeek < 1) {
    let lastMonth;
    if (month === 1) {
      lastMonth = 12;
      year--;
    } else {
      lastMonth = month - 1;
    }
    const lastMonthDays = new Date(year, lastMonth, 0).getDate();
    lastWeeksDate = `${lastMonth}/${lastMonthDays + lastWeek}/${year}`;
  } else {
    lastWeeksDate = `${month}/${lastWeek}/${year}`;
}

async function connectToMongoDb() {
  await mongoose.connect(
    "mongodb+srv://abbieteddysmith:abbie1989smith@cidirae.n3bhdiz.mongodb.net/knoxcounty?retryWrites=true&w=majority",
    { useNewUrlParser: true }
  );
  console.log("Connected to MongoDb!");
  setTimeout(() => {
    console.log("Continuing after 3 seconds...");
  }, 3000);
}

async function countyScraper(page, browser) {
  await page.goto("https://www.searchiqs.com/mekno/");
  // Log in as guest and navigate to search page
  const guestLogIn = "#btnGuestLogin";
  await page.click(guestLogIn);
  await page.waitForSelector('#ContentPlaceHolder1_cmdSearch');
  const pages = await browser.pages();
  const searchPage = pages.find(
    (p) => p.url() === "https://www.searchiqs.com/mekno/SearchAdvancedMP.aspx"
  );
  if (!searchPage) {
    console.error("Search page not found");
    return;
  }
  // Enter search criteria and click search button
  await searchPage.type("input#ContentPlaceHolder1_txtFromDate", lastWeeksDate);
  await searchPage.type("input#ContentPlaceHolder1_txtThruDate", currentDate);
  await searchPage.select("#ContentPlaceHolder1_cboDocType", "PROBATE");
  const searchRecords = "#ContentPlaceHolder1_cmdSearch";
  await searchPage.click(searchRecords);
  // Wait for search results page to load and extract data using Cheerio
  await searchPage.waitForSelector('#ContentPlaceHolder1_lblSearchTime');
  const pagesAfterSearch = await browser.pages();
  const searchResultsPage = pagesAfterSearch.find(
    (p) => p.url() !== "about:blank" && p.url() !== "data:,"
  );
  if (!searchResultsPage) {
    console.error("Search results page not found");
    return;
  }
  const html = await searchResultsPage.content();
  const $ = cheerio.load(html);
  // ... extract data from the page using Cheerio ...
  const results = $(
    "#ContentPlaceHolder1_grdResults > tbody > tr > td:nth-child(1) > input"
  );
  let titles = [];

  if (results.length === 0) {
    console.log("No data available for this time range");
  } else {
    titles = results
      .map(function () {
        return $(this).attr("id");
      })
      .get();
  }

  // Function to navigate to each view record and scrape data
  async function scrapeData(viewBtnArr) {
    for (let i = 0; i < viewBtnArr.length; i++) {
      const viewRecord = `#${viewBtnArr[i]}`;
      await searchResultsPage.click(viewRecord);

      await searchResultsPage.waitForSelector('#ContentPlaceHolder1_lblDetails2 > table > tbody > tr > td > font:nth-child(17) > nobr');
      const pagesAfterView = await browser.pages();
      const docPage = pagesAfterView.find(
        (p) => p.url() !== "about:blank" && p.url() !== "data:,"
      );
      if (!docPage) {
        console.error("Search results page not found");
        return;
      }

      const docHtml = await docPage.content();
      const $ = cheerio.load(docHtml);

      // ... extract data from the page using Cheerio ...
      const orPartyNames = [];
      const orPartyFont = $(
        "#ContentPlaceHolder1_lblDetails2 > table > tbody > tr > td > font:nth-child(17)"
      );
      const orPartyNobrs = orPartyFont.find("nobr");
      orPartyNobrs.each((index, element) => {
        orPartyNames.push($(element).text().trim());
      });
      let orPartyFormatted = " OR Party:\n";
      for (let i = 0; i < orPartyNames.length; i++) {
        orPartyFormatted += `${orPartyNames[i]}\n`;
      }

      const eePartyNames = [];
      const eePartyFont = $(
        "#ContentPlaceHolder1_lblDetails2 > table > tbody > tr > td > font:nth-child(22)"
      );
      const eePartyNobrs = eePartyFont.find("nobr");
      eePartyNobrs.each((index, element) => {
        eePartyNames.push($(element).text().trim());
      });

      let eePartyFormatted = "EE Party:\n";
      for (let i = 0; i < eePartyNames.length; i++) {
        eePartyFormatted += `${eePartyNames[i]}\n`;
      }

      const townNames = [];
      const townFont = $(
        "#ContentPlaceHolder1_lblDetails2 > table > tbody > tr > td > font:nth-child(27)"
      );
      townFont.each((index, element) => {
        townNames.push($(element).text().trim());
      });

      let townsFormatted = "Town:\n";
      for (let i = 0; i < townNames.length; i++) {
        townsFormatted += `${townNames[i]}\n`;
      }

      const docDate = $(
        "#ContentPlaceHolder1_lblDetails2 > table > tbody > tr > td > font:nth-child(31)"
      ).text();
      docDateFormatted = `Document Date: ${docDate}\n`;

      const newListing = new Listing({
        orPartyNames: orPartyNames.join(', '),
        eePartyNames: eePartyNames.join(', '),
        townNames: townNames.join(', '),
        docDate: new Date(docDate)
      });
      
      await newListing.save();

      if (i === viewBtnArr.length - 1) {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB!");
      }

      // Go back to search results page
      await docPage.goBack({ waitUntil: "networkidle0" });
    }
  }

  // Call scrapeData function and pass in array of view button IDs
  await scrapeData(titles);

  // Close the browser
  await browser.close();
}

async function main() {
  await connectToMongoDb();
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const leads = await countyScraper(page, browser);
}

main();