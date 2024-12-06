const express = require('express');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cors = require('cors');
const passport = require('passport');
const httpStatus = require('http-status');
const config = require('./config/config');
const morgan = require('./config/morgan');
const { jwtStrategy } = require('./config/passport');
const { authLimiter } = require('./middlewares/rateLimiter');
const routes = require('./routes/v1');
const { errorConverter, errorHandler } = require('./middlewares/error');
const ApiError = require('./utils/ApiError');
const app = express();

if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// set security HTTP headers
app.use(helmet());

// parse json request body
app.use(express.json());

// parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

// sanitize request data
app.use(xss());
app.use(mongoSanitize());

// gzip compression
app.use(compression());

// enable cors
app.use(cors());
app.options('*', cors());

// jwt authentication
app.use(passport.initialize());
passport.use('jwt', jwtStrategy);

// limit repeated failed requests to auth endpoints
if (config.env === 'production') {
  app.use('/v1/auth', authLimiter);
}

// v1 api routes
app.use('/v1', routes);

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

////
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path')
const http = require('http')

let data = 'mediaId=52168';
const baseURL = "https://www.romsgames.net"

let downloadLinks = [];

// Create the 'logDownloadPath.log' file if it doesn't exist
const logDownloadPath = path.join(__dirname, 'downloads_paths.log');
if (!fs.existsSync(logDownloadPath)) {
  fs.writeFileSync(logDownloadPath, ''); // Create an empty file
}
// Create the 'failed_downloads.log' file if it doesn't exist
const logFilePath = path.join(__dirname, 'failed_downloads.log');
if (!fs.existsSync(logFilePath)) {
  fs.writeFileSync(logFilePath, ''); // Create an empty file
}
// Create the 'download' folder if it doesn't exist
const downloadPath = path.join(__dirname, 'downloads'); // Get the path to the 'download' folder
if (!fs.existsSync(downloadPath)) {
  fs.mkdirSync(downloadPath);
}
let downloadedCount = 0;
let totalFiles = 0;

const downloadFileStream = (url, filename) => {
  totalFiles++;
  const filePath = path.join(downloadPath, filename); // Combine the download folder with the filename
  const writer = fs.createWriteStream(filePath);
  const headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Pragma': 'no-cache',
    'Referer': 'https://www.romsgames.net/',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-site',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"'
  };
  axios({
    method: 'get',
    url,
    responseType: 'stream',
    headers: headers
  })
    .then((response) => {
      response.data.pipe(writer);
      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    })
    .then(() => {
      downloadedCount++; // Increment the downloaded count
      const progress = Math.round((downloadedCount / totalFiles) * 100);
      console.log(`Downloaded ${filename} to ${downloadPath} - ${progress}% complete`);
      if (downloadedCount === totalFiles) {
        console.log("All files downloaded! DONE");
      }
    })
    .catch((error) => {
      console.error(`Failed to download ${filename}:`, error.message); // Log the failed download to the file
      fs.appendFileSync(logFilePath, `${url}\n`);
    });
};

const downloadFile = (mediaId, href) => {
  // const url = `${baseURL}/download/${mediaId}/${href}`;
  // console.log(mediaId, href)
  let config = {
    method: 'post',
    maxBodyLength: Infinity,
    url: href + '?download',
    headers: {
      'accept': 'application/json',
      'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
      'cache-control': 'no-cache',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'origin': baseURL,
      'pragma': 'no-cache',
      'priority': 'u=1, i',
      'referer': href,
      'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      'x-requested-with': 'XMLHttpRequest'
    },
    data: `mediaId=${mediaId}`
  };

  axios.request(config)
    .then((response) => {
      const data = response.data;
      const downloadUrl = `${data.downloadUrl}?mediaId=${mediaId}&attach=${encodeURIComponent(data.downloadName)}`
      const fileName = data.downloadName;
      const filePath = `${fileName}`;

      // fs.appendFileSync(logDownloadPath, `${downloadUrl}\n`);
      downloadFileStream(downloadUrl, fileName)

    })
    .catch((error) => {
      fs.appendFileSync(logFilePath, `${href}\n`);
      // console.error(mediaId, )
      // console.log(error.message);
    });

}
axios.get(baseURL + '/roms/nintendo-ds/?sort=popularity')
  .then(response => {
    const $ = cheerio.load(response.data);
    const navElement = $('nav[aria-label="Page Navigation"]');
    // console.log(navElement.html());
    const links = $('a[href^="/roms/nintendo-ds"]').map((i, el) => {
      return $(el).attr('href');
    }).get();
    // console.log(links);
    links.forEach((link, index) => {
      if (link !== "/roms/nintendo-ds/") {
        const url = baseURL + link;
        // console.log(url)
        axios.get(url)
          .then(response => {

            // console.log(response.data);
            const $ = cheerio.load(response.data);
            const gridElements = $('div[class="grid gap-6 lg:gap-8 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 text-center"]');
            // console.log("gridElements", gridElements)
            const hrefs = gridElements.find('a').map((i, el) => {
              return $(el).attr('href');
            }).get();

            hrefs.forEach((href, index) => {
              setTimeout(() => {
                const gameLink = baseURL + href
                axios.get(gameLink)
                  .then(response => {
                    const $ = cheerio.load(response.data);
                    const dataMediaId = $('button').attr('data-media-id');
                    // console.log("dataMediaId", dataMediaId)

                    downloadFile(dataMediaId, baseURL + href)
                  }).catch(error => {
                    console.log("hrefs", error.message);
                  })
              }, 3600 * index)
            })
          })
          .catch(error => {
            console.error(error.message);
          });
      }
    });
  })
  .catch(error => {
    console.error(error.message);
  });
////

module.exports = app;
