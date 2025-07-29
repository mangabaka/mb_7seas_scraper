import { series_api, all_authors_page_parse, all_series_page_parse, parse_series_page, parse_book_page } from './sevenseas.js'
import { string_to_date } from './date.js'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { writeFile } from 'fs/promises'

async function saveJsonToFileAsync(data: any, path: string) {
  try {
    const jsonString = JSON.stringify(data, null, 2);

    await writeFile(path, jsonString, 'utf8');
    console.log(`JSON data successfully saved to ${path} (async).`);
  } catch (error) {
    console.error(`Error saving JSON data to ${path} (async):`, error);
  }
}

export async function http_request(url: string = ''): Promise<cheerio.CheerioAPI> {
    try {
        const response = await axios.get(url, {
            maxRedirects: 1,
        })

        if (response.status !== 200) {
            throw new Error(`Failed to retrieve the web page - got response code [${response.status}] for URL [${url}]`)
        }

        console.log('Successfully fetched URL. Loading with Cheerio...')
        return cheerio.load(response.data)
    } catch (error: any) {
        console.error('An error occurred during parsing:')
        if (error.response) {
            console.error(`Status: ${error.response.status}`)
            console.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`)
        } else if (error instanceof Error) {
            console.error(`Error: ${error.message}`)
        } else {
            console.error(error)
        }
        process.exit(1)
    }
    
}

// Get the URL from command line arguments
const cmd = process.argv[2]
const url = process.argv[3]

if (cmd == 'book') {
    const book_details = await parse_book_page(url)
    const file_path = './data/book_' + url + '.json'
    saveJsonToFileAsync(book_details, file_path)   
} else if (cmd == 'all_series_api') {
    const all_series = await series_api()
    const file_path = './data/all_series_api_' + Date.now().toString() + '.json'
    saveJsonToFileAsync(all_series, file_path)
} else if (cmd == 'all_series_api_after') {
    const date_after = string_to_date(url).toJSDate()
    if (date_after === null) {
        throw new Error(`Invalid date: ${url}`)
    }
    const all_series = await series_api(date_after)
    const file_path = './data/all_series_api_after_' + url + '.json'
    saveJsonToFileAsync(all_series, file_path)
} else if (cmd == 'all_series') {
    const all_series = await all_series_page_parse()
    const file_path = './data/all_series_' + Date.now().toString() + '.json'
    saveJsonToFileAsync(all_series, file_path)
} else if (cmd == 'full_series') {
    const series_details = await parse_series_page(url)
    const file_path = './data/series_full_' + url + '.json'
    saveJsonToFileAsync(series_details, file_path)    
} else if (cmd == 'authors') {
    const authors = await all_authors_page_parse()
    const file_path = './data/authors.json'
    saveJsonToFileAsync(authors, file_path)
}

/*else if (cmd == 'new') {
    const new_releases = await new_pending_releases();
    const file_path = './data/manga_new_releases_' + Date.now().toString() + '.json'
    saveJsonToFileAsync(new_releases, file_path)
}  else if (cmd == 'series') {
    // Expects series ID (a number)
    const series_details = await bwg_parse_series_json(parseInt(url))
    const file_path = './data/manga_series_' + url + '.json'
    saveJsonToFileAsync(series_details, file_path)
} else if (cmd == 'full_series') {
    // Expects series ID (a number)
    const series_details = await full_series_data(parseInt(url))
    const file_path = './data/series_full_' + url + '.json'
    saveJsonToFileAsync(series_details, file_path)
} else if (cmd == 'book_api') {
    // Expects book ID(s) (splits IDs by comma: uuid1,uuid2,uuid3)
    const book_ids = url.split(',')
    const book_details = await bwg_parse_book_api(book_ids)
    const file_path = './data/book_' + url + '.json'
    saveJsonToFileAsync(book_details, file_path)
} else if (cmd == 'pubs') {
    const publishers = await all_publishers_page_parse()
    const file_path = './data/publishers.json'
    saveJsonToFileAsync(publishers, file_path)
} else if (cmd == 'authors') {
    const authors = await all_authors_page_parse()
    const file_path = './data/authors.json'
    saveJsonToFileAsync(authors, file_path)
}*/
