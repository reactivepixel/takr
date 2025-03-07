const puppeteer = require('puppeteer');
const Sentiment = require('sentiment');
const fs = require('fs');

async function processXPost(url) {
  // Launch a visible browser window
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Navigate to the post URL and wait for it to load
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Extract the post text
    // Find the span with "Follow" text, traverse up to find the container, then navigate to the post content
    // Wait for any span to be available, then find the one with "Follow" text in the client-side code
    await page.waitForSelector('span', { timeout: 5000 });
    const postText = await page.evaluate(() => {
      const followSpan = Array.from(document.querySelectorAll('span')).find(span => span.textContent === 'Follow');
      if (!followSpan) return 'Follow span not found';
      
      // Go up 10 parent elements
      let element = followSpan;
      for (let i = 0; i < 10; i++) {
        if (!element.parentElement) break;
        element = element.parentElement;
      }
      
      // Get the 3rd child element
      const thirdChild = element.children[2];
      if (!thirdChild) return 'Third child not found';
      
      // Navigate through nested divs to find the span with post text
      const nestedDiv1 = thirdChild.querySelector('div');
      if (!nestedDiv1) return 'First nested div not found';
      
      const nestedDiv2 = nestedDiv1.querySelector('div');
      if (!nestedDiv2) return 'Second nested div not found';
      
      const nestedDiv3 = nestedDiv2.querySelector('div');
      if (!nestedDiv3) return 'Third nested div not found';
      
      const contentSpan = nestedDiv3.querySelector('span');
      return contentSpan ? contentSpan.innerText.trim() : 'Content span not found';
    });
    console.log('Post content:', postText);

    // Perform sentiment analysis on the post text
    const sentiment = new Sentiment();
    const sentimentResult = sentiment.analyze(postText);
    console.log('Sentiment analysis:', sentimentResult);

    // Return the results for CSV output
    return {
      url,
      postText,
      score: sentimentResult.score,
      comparative: sentimentResult.comparative,
      positive: JSON.stringify(sentimentResult.positive),
      negative: JSON.stringify(sentimentResult.negative)
    };

  } catch (error) {
    console.error('Error processing URL:', url, error.message);
    return {
      url,
      postText: 'Error: ' + error.message,
      score: 0,
      comparative: 0,
      positive: '[]',
      negative: '[]'
    };
  } finally {
    // Close the browser
    await browser.close();
  }
}

// Function to process all URLs and save results to CSV
async function processAllPosts() {
  // Read the input CSV file
  if (!fs.existsSync('src/input.csv')) {
    console.error('Error: src/input.csv file not found');
    return;
  }

  const inputData = fs.readFileSync('src/input.csv', 'utf8');
  const rows = inputData.split('\n').filter(row => row.trim() !== '');
  
  // Assume first row is header, extract post URLs from first column
  const postUrls = rows.slice(1).map(row => row.split(',')[0].trim());
  
  if (postUrls.length === 0) {
    console.error('No URLs found in src/input.csv');
    return;
  }
  
  console.log(`Processing ${postUrls.length} URLs from src/input.csv...`);
  
  // Process each URL one by one to avoid overloading the browser
  const results = [];
  for (const url of postUrls) {
    console.log(`Processing URL: ${url}`);
    const result = await processXPost(url);
    results.push(result);
  }
  
  // Create CSV header and data rows
  const headers = ['url', 'postText', 'score', 'comparative', 'positive', 'negative'];
  const csvContent = [
    headers.join(','),
    ...results.map(result => {
      return [
        `"${result.url}"`,
        `"${(result.postText || '').replace(/"/g, '""')}"`,
        result.score,
        result.comparative,
        `"${result.positive}"`,
        `"${result.negative}"`
      ].join(',');
    })
  ].join('\n');
  
  // Write to src/output.csv
  fs.writeFileSync('src/output.csv', csvContent, 'utf8');
  console.log(`Results saved to src/output.csv (${results.length} rows)`);
}

// Run the batch processing
processAllPosts().catch(err => console.error('Process failed:', err));