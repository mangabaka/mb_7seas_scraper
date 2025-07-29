import { string_to_date } from './date.js'
//import { Logger } from '$lib/logger'
//import SeriesNews from '$lib/server/models/SeriesNews.model'
import { SevenSeasMangaBakaSeries, SevenSeasMangaBakaBook } from './sevenseas.types.js'
import axios, { all } from 'axios'
import * as cheerio from 'cheerio'
import { http_request } from './runner.js'
//import tracer, { type TraceOptions } from 'dd-trace'
//import { kinds } from 'dd-trace/ext'
//import tags from 'dd-trace/ext/tags'
import type { Job } from 'pg-boss'
import { it, ja, no, tr } from 'zod/v4/locales'
import { AnyNode } from 'domhandler'
import { number, uuid } from 'zod/v4'
import { compileFunction } from 'vm'
import { DateTime } from 'luxon'
//import parser from 'xml2json'
//import SourceAnimeNewsNetwork from '../models/SourceAnimeNewsNetwork.model'
//import { Queue, QueueClient } from '../queue'

enum age_ratings_enum {
	'allages' = 'All Ages',
	'teen' = 'Teen',
	'tenplus' = 'Ten Plus',
	'olderteen' = 'Older Teen',
	'olderteen15' = 'Older Teen (15+)',
	'olderteen17' = 'Older Teen (17+)',
	'forreaders17' = 'For Readrers 17+',
	'mature' = 'Mature',
}

export async function all_authors_page_parse(): Promise<Record<string, any>[]> {
	const all_authors: Record<string, any>[] = []

	const $ = await http_request('https://sevenseasentertainment.com/creator/')

	const all_page = $('table#releasedates tbody')

	for (const item of all_page?.children('tr#volumes')) {
		const $item = $(item)
		const author_name = $item.text().trim()
		const author_url_text = $item.find('a')?.attr('href')
		const author_url = author_url_text ? new URL(author_url_text) : null

		const author = {
			'name': author_name,
			'link': author_url?.toString() || null
		}
		all_authors.push(author)
		
	}
	return all_authors
}

export async function series_api(date_after: Date | null = null): Promise<Record<string, any>[]> {
	// Use date_after to get modified series
	let page = 1

	const all_series: Record<string, any>[] = []

	let url = `https://sevenseasentertainment.com/wp-json/wp/v2/series?orderby=title&order=asc&per_page=100&page=`
	if (date_after) {
		url = `https://sevenseasentertainment.com/wp-json/wp/v2/series?orderby=title&after=${date_after.toISOString()}&order=asc&per_page=100&page=`
	}

	while (page != -1) {
		try {
			const response = await fetch(url + page.toString())

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`)
			}

			const data = await response.json()
			// No way to know next page etc.
			if (data.length === 0) {
				break
			} else if (data.length <100) {
				// If we don't get the full 100, presume last page
				page = -1
			} else {
				page ++
			}

			for (const item of data) {
				//const series: Record<string, any> = {}
				const series_title_details = clean_series_title(item['title']['rendered'])
				
				const status = item['status'] // publish etc.
				const series_url = new URL(item['link'])
				const description_raw = item['content']['rendered']?.replaceAll('<p>', '').replaceAll('</p>', '\n').trim()
				// Strip <strong> as it seems to be mostly blurb and links
				const description = /(?:^.*\<\/strong\>$)?(.*)/gms.exec(description_raw)?.[1].trim().replaceAll('\n\n', '\n') || null

				const tags: Array<string> = []

				for (const tag of item['class_list']) {
					if (tag.startsWith('tag-')) {
						tags.push(tag.slice(4))
					}
				}

				const series = {
					'series_id': item['id'],
					'series_slug': item['slug'],
					'series_title': series_title_details['series_title'],
					'series_status': status,
					'series_type': series_title_details['type'],
					'series_edition': series_title_details['edition'],
					'series_link': series_url.toString(),
					'series_description': description,
					'series_date': item['date'],
					'series_modified': item['modified'],
				}

				all_series.push(series)
			}

		} catch (error) {
			console.error(`Error fetching all series API: `, error instanceof Error ? error.message : error);
			process.exit(1)
		}
	}
	
	return all_series
}

export async function all_series_page_parse(): Promise<Record<string, any>[]> {
	const all_series: Record<string, any>[] = []

	const $ = await http_request('https://sevenseasentertainment.com/series-list/')

	const all_page = $('table#listview tbody')

	for (const item of all_page?.children('tr#volumes')) {
		const $item = $(item)
		const title = $item.text().trim()
		const series_title_details = clean_series_title(title)
		const series_url_text = $item.find('a')?.attr('href')
		const series_url = series_url_text ? new URL(series_url_text) : null

		const series = {
			'series_slug': series_url?.pathname.slice(8, -1) || null,
			'series_title': series_title_details['series_title'],
			'series_type': series_title_details['type'],
			'series_edition': series_title_details['edition'],
			'series_link': series_url?.toString() || null
		}
		all_series.push(series)
		
	}
	
	return all_series
}

export async function parse_series_page(slug: string): Promise<Record<string, any>> {
	if (!slug) {
		throw new Error('Missing slug')
	}
	const $ = await http_request('https://sevenseasentertainment.com/series/' + slug)

	const content = $('#content')

	let series_details: Record<string, any> = {}

	const title_raw = content.find('.topper').text().replace('Series: ', '')
	const title_details = clean_series_title(title_raw)
	const title = title_details['series_title']
	const titles = content.find('#originaltitle').text()
	const titles_split = titles?.split(' | ')
	let title_ja_en = null
	let title_ja = null
	// Usually first title is Japanese but not always...
	const count_non_latin_match = titles_split?.[0].match(/[^\x00-\x7F]/g)
	if (count_non_latin_match !== null && count_non_latin_match.length > 0) {
		title_ja = titles_split[0]
		title_ja_en = titles_split?.[1]
	} else {
		title_ja = titles_split?.[1]
		title_ja_en = titles_split[0]
	}

	// For fun they also use this for 'Airship' and other imprints
	const age_rating = get_age_rating(content.find('div.age-rating'))

	// Grab all the 'a' tags and sort them
	const all_a = content.find('#series-meta a')
	const creators = []
	const tags = []
	for (const a of all_a) {
		const $a = $(a)
		if ($a.attr('href')?.includes('creator')) {
			creators.push({'name': $a.text(), 'link': $a.attr('href')})
		} else if ($a.attr('rel') == 'tag') {
			tags.push({'genre': $a.text(), 'link': $a.attr('href')})
		}
	}
	const description = content.find('div.series-description').text()
	const _volumes = content.find('div.volumes-container')

	series_details['series_title'] = title
	series_details['series_title_ja_en'] = title_ja_en
	series_details['series_title_ja'] = title_ja
	series_details['series_slug'] = slug
	series_details['type'] = title_details['type']
	series_details['distributor'] = 'Seven Seas Entertainment',
	series_details['edition'] = title_details['edition']
	series_details['age_rating'] = age_rating
	series_details['description'] = description
	series_details['staff'] = []
	// There is no order to the creators, so Story & Art by could have names reversed.
	// If there is only one, then we are safe to use it
	if (creators.length === 1) {
		series_details['staff'].push({
			'name': creators[0]['name'],
			'link': creators[0]['link'],
			'role': 'writer'
		})
		series_details['staff'].push({
			'name': creators[0]['name'],
			'link': creators[0]['link'],
			'role': 'artist'
		})
	}
	
	series_details['genres'] = tags

	series_details['volumes'] = []
	for (const volume of _volumes?.children('a')) {
		const $volume = $(volume)
		const vol_url_text = $volume?.attr('href')
		const vol_url = vol_url_text ? new URL(vol_url_text) : null
		const vol_slug = vol_url?.pathname.slice(7, -1)
		const _vol_title = $volume.find('h3').text()
		const vol_title_match = /(.*)(?:\svol.*?([\d-]+))/i.exec(_vol_title)
		const vol_title = vol_title_match?.[1] && vol_title_match?.[1] != title_raw ? vol_title_match[1] : null
		const vol_num = vol_title_match?.[2] ? vol_title_match[2] : null
		const cover = $volume.find('img')?.attr('src') || null
		// TS is a whiney bitch
		const release_date_ele = $volume.find('b:contains("Release")')?.[0]?.next
		const release_date = release_date_ele && release_date_ele.nodeType === 3 ? release_date_ele?.data.replace(':', '').trim() : null
		const digital_date_ele = $volume.find('b:contains("Digital")')?.[0]?.next
		const digital_date = digital_date_ele && digital_date_ele.nodeType === 3 ? digital_date_ele?.data.replace(':', '').trim() : null
		const vol_price_ele = $volume.find('b:contains("Price:")')?.[0]?.next
		const vol_price = vol_price_ele && vol_price_ele.nodeType === 3 ? vol_price_ele?.data.trim()?.slice(1) : null
		const format_ele = $volume.find('b:contains("Format:")')?.[0]?.next
		const format = format_ele && format_ele.nodeType === 3 ? format_ele?.data.trim().toLowerCase() : null
		const isbn_ele = $volume.find('b:contains("ISBN:")')?.[0]?.next
		const isbn = isbn_ele && isbn_ele.nodeType === 3 ? isbn_ele?.data.trim() : null

		series_details['volumes'].push({
			'slug': vol_slug,
			'title': vol_title,
			'number': vol_num,
			'cover': cover,
			'release_date': release_date ? string_to_date(release_date).toJSDate() : null,
			'digital_date': digital_date ? string_to_date(digital_date).toJSDate() : null,
			'price': vol_price ? {'value': Number(vol_price), 'iso_code': 'USD'} : null,
			'distributor': 'Seven Seas Entertainment',
			'type': format,
			'isbn': isbn
		})
	}

	// Use volume 1 as cover for series
	series_details['cover'] = series_details['volumes']?.[0]['vol_cover']
	series_details['volume_count'] = series_details['volumes'].length

	return SevenSeasMangaBakaSeries.parse(series_details)
}

export async function parse_book_page(slug: string): Promise<Record<string, any>> {
	if (!slug) {
		throw new Error('Missing slug')
	}
	const $ = await http_request('https://sevenseasentertainment.com/books/' + slug)

	const content = $('#content')

	const series_title_ele = content.find('b:contains("Series:")')?.next()
	const series_title_raw = series_title_ele?.text().trim()
	const series_title_details = clean_series_title(series_title_raw)
	const series_title = series_title_details['series_title']
	const series_type = series_title_details['type'] || null
	const series_edition = series_title_details['edition'] || null
	const series_url_text = series_title_ele?.children()?.attr('href')
	const series_url = series_url_text? new URL(series_url_text) : null

	const series = {
		'series_title': series_title,
		'series_slug': series_url?.pathname.slice(8, -1),
		'series_link': series_url?.toString(),
		'series_type': series_type,
		'distributor': 'Seven Seas Entertainment',
		'series_edition' : series_edition
	}

	const title_raw = content.find('.topper').text().replace('Book: ', '')
	const title = clean_title(title_raw, series_title)
	const vol_title_match = /(.*)(?:\svol.*?([\d-]+))/i.exec(title_raw)
	const vol_num = vol_title_match?.[2] ? vol_title_match[2] : null
	const cover = content.find('div#volume-cover img')?.attr('src')
	const age_rating = get_age_rating(content.find('div.age-rating'))

	const story_art_by = content.find('b:contains("Story &")').next()
	const story_by = content.find('b:contains("Story by")').parent()
	const art_by = content.find('b:contains("Art by")').parent()
	const creators = []
	const staff = []

	for (const a of story_art_by.children('a')) {
		const $a = $(a)
		if ($a.attr('href')?.includes('creator')) {
			creators.push({'name': $a.text(), 'link': $a.attr('href')})
		}
	}
	// If there is only one, then we are safe to use it
	if (creators.length === 1) {
		staff.push({
			'name': creators[0]['name'],
			'link': creators[0]['link'],
			'role': 'writer'
		})
		staff.push({
			'name': creators[0]['name'],
			'link': creators[0]['link'],
			'role': 'artist'
		})
	}

	if (story_by) {
		for (const a of story_by.children('a')) {
			const $a = $(a)
			if ($a.attr('href')?.includes('creator')) {
				staff.push({'name': $a.text(), 'link': $a.attr('href'), 'role': 'writer'})
			}
		}
	}
	if (art_by) {
		for (const a of art_by.children('a')) {
			const $a = $(a)
			if ($a.attr('href')?.includes('creator')) {
				staff.push({'name': $a.text(), 'link': $a.attr('href'), 'role': 'artist'})
			}
		}
	}

	const book_crew = content.find('.bookcrew')
	const translator_ele = book_crew.find(':contains("Translation")')?.[0]?.next
	const translator = translator_ele && translator_ele.nodeType === 3 ? translator_ele?.data.replace(':', '').trim() : null
	const adaptation_ele = book_crew.find(':contains("Adaptation")')?.[0]?.next
	const adaptation = adaptation_ele && adaptation_ele.nodeType === 3 ? adaptation_ele?.data.replace(':', '').trim() : null
	const lettering_ele = book_crew.find(':contains("Lettering")')?.[0]?.next
	const lettering = lettering_ele && lettering_ele.nodeType === 3 ? lettering_ele?.data.replace(':', '').trim() : null

	if (translator) {
		staff.push({'name': translator, 'link': null, 'role': 'translator'})
	}
	if (adaptation) {
		staff.push({'name': adaptation, 'link': null, 'role': 'adaptation'})
	}
	if (lettering) {
		staff.push({'name': lettering, 'link': null, 'role': 'lettering'})
	}

	const description_ele = book_crew?.next()?.next()
	const description = description_ele?.nextAll()?.map((i, ele) => {
    if (ele && ele?.name === 'p') {
			const $ele = $(ele)
      return $ele.text().trim()
    }
    return null
  })
  .get()
  .join('\n\n')

	const book: Record<string, any> = {
		'series': series,
		'title': title != series_title ? title : null,
		'slug': slug,
		'number': vol_num,
		'cover': cover,
		'age_rating': age_rating,
		'distributor': 'Seven Seas Entertainment',
		'type': series_title_details['type'],
		'edition': series_title_details['edition'],
		'staff': staff,
		'description': description
	}

	const all_text = content.find('#volume-meta').text().replace('Trim', ' Trim')
	const all_text_match = all_text.matchAll(/(?:Date:\s(?<release>\w+\s\d{1,2}.\s\d{4}))|(?:Digital:\s(?<digital>\w+\s\d{1,2}.\s\d+))|(?:Price:\s\$(?<price>\d+\.\d+))|(?:Format:\s(?<format>\w+)Trim?)|(?:Trim:\s(?<trim>\d+\.\d+\sx\s\d+\.\d+))|(?:Page\sCount:\s(?<pages>\d+))|(?:ISBN:\s(?<isbn>\d{3}-\d{1}-\d{5}-\d{3}-\d{1}))/g)
	for (const match of all_text_match) {
		for (const key in match.groups) {
			if (match.groups[key] !== undefined) {
				if (key == 'pages') {
					book[key] = Number(match.groups[key])
				} else if (key == 'price') { 
					book[key] = {
						'value': Number(match.groups[key]),
						'iso_code': 'USD'
					}
				} else if (key == 'release' || key == 'digital') {
					book[key + '_date'] = string_to_date(match.groups[key]).toJSDate()
				} else {
					book[key] = match.groups[key]
				}
			}
		}
	}

	return SevenSeasMangaBakaBook.parse(book)
}

export async function all_tags() {
	const url = 'https://sevenseasentertainment.com/wp-json/wp/v2/tags?per_page=100'

	try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
		for (const item of data['series_info']) {
			if (!item['series_no']) {
				continue
			}
		}

  } catch (error) {
    console.error(`Error fetching series all tags:`, error instanceof Error ? error.message : error);
    process.exit(1)
  }	
}

function clean_series_title(series_title: string): Record<string, any> {
	// Types: Manga, Novel, Light Novel, Comic, The Comic / Manhua, Omnibus, New Edition Rerelease, Omnibus Collection, 
	// Illustrated Novel, WEBTOON, Kakukaku Shikajika, Bloom Into You (Light Novel): Regarding Saeki Sayaka,
	// Heroine? Saint? No, I’m an All-Works Maid (And Proud of It)! (Light Novel), Series, Hardcover, Memoir, 
	const series_title_main = /^(?<title>.*)\s\((?<type>.*)\)/.exec(series_title)
	let series_title_clean: string = series_title
	let series_type: string = 'manga'
	let edition = null //Omnibus, Hardcover, New Edition
	if (series_title_main && series_title_main.groups) {
		series_title_clean = series_title_main.groups.title
		if (series_title_main.groups.type) {
			switch (series_title_main.groups.type) {
				case 'Light Novel':
					series_type = 'light novel'
					break
				case 'Novel':
				case 'Illustrated Novel':
					series_type = 'novel'
					break
				case 'Comic':
					series_type = 'webtoon'
					break
				case 'WEBTOON':
					series_type = 'webtoon'
					break
				case 'The Comic / Manhua':
					series_type = 'manhau'
					break
				case 'The Comic':
					series_type = 'webtoon'
					break
				case 'Series':
					series_type = 'manga'
					break
				case 'Memoir':
					series_type = 'novel'
					break
				default:
					series_type = 'manga'
			}
		}

		if (series_title_main.groups.type) {
			switch (series_title_main.groups.type) {
				case 'Omnibus':
				case 'Omnibus Collection':
					edition = 'omnibus'
					break
				case 'Hardcover':
					edition = 'hardcover'
					break
				case 'New Edition Rerelease':
					edition = 'new_edition'
			}
		}
		
	}
	return {'series_title': series_title_clean, 'type': series_type, 'edition': edition}
}

function clean_title(book_title: string, series_title: string = '') {
	const book_title_clean = book_title.replace(series_title, '')
	const book_title_match = /(\w.*)(?:\sVol.*)/i.exec(book_title_clean)
	const book_title_cleaned = book_title_match && book_title_match[1] ? clean_series_title(book_title_match[1]) : null
	return book_title_cleaned && book_title_cleaned['series_title'] ? book_title_cleaned['series_title'].trim() : null
}

function get_age_rating(ages: any | null): string | null {
	if (ages === null) {
		return ''
	}
	// For fun they also use this for 'Airship' and other imprints
	let age_rating = null
	for (const a_r of ages) {
		const a_r_id: string = a_r.attribs?.['id'] || ''
		const enumKey = a_r_id as keyof typeof age_ratings_enum
		age_rating = age_ratings_enum[enumKey] ? age_ratings_enum[enumKey] : null
	}
	return age_rating
}

/*async function author_name_link_to_id(author_name: string): Promise<Record<string, string> | null> {
	const author_path = new URL('.././data/authors.json', import.meta.url)
	try {
		const authors = JSON.parse(await readFile(author_path, { encoding: 'utf8' }))

		const author = authors.find(
			(author: { author_id: number, author_name: string, author_url: string }) => 
				author.author_name === author_name)

		if (!author) {
			return null
		}

		return {
			id: author.author_id,
			name: author.author_name,
			link: author.author_url
		}
	}
	catch (error) {
		console.log('Failed to load authors.json from ', author_path)
	}
	return null
}*/

/*export async function full_series_data(series_id: number) {
	if (!series_id) {
		console.log('Missing required series ID')
		process.exit(1)
	}
	const data: Record<string, any> = {}
	const series_books = await bwg_parse_series_json(series_id)

	if (series_books === null) {
		console.log('No books found!')
		process.exit(1)
	}

	// Use the first volume/chapter for further info
	if (series_books[0]) {
		const book_info = await bwg_parse_book_api([series_books[0]['uuid']])

		if (book_info !== null) {
			// Make life easier and extract chapter or volume
			
			const book_chap_vol = book_info['is_chapter_series'] ? book_info['chapters'][0] : book_info['volumes'][0]
			data['series_id'] = series_id
			data['series_title'] = book_info['series_title']
			data['series_title_ja'] = book_info['series_title_ja']
			// TODO Some kind of post-process to find the volume series id to link/merge. DB trigger?
			// Page scrape can find this
			data['is_chapter_series'] = book_info['is_chapter_series']
			data['series_linked_id'] = null // This is to link series IDs between chapter and volumes series IDs
			data['url'] = 'https://global.bookwalker.jp/series/' + series_id
			data['type'] = book_info['type']
			data['cover'] = book_chap_vol['cover']
			data['thumbnail'] = book_chap_vol['thumbnail']
			//data['series_title_ja_en'] = book_info[0]['']
			data['staff'] = book_chap_vol['staff']
			data['distributor'] = book_info['distributor']
			// If it's not chapter 1 or volume 1, don't want the description as it won't make sense for series
			data['description'] = book_chap_vol['number'] == 1 ? book_chap_vol['description'] : null

			// Use the last record as chapters are removed once said chapters are within a volume
			if (data['is_chapter_series']) {
				data['chapter_count'] = series_books[series_books.length - 1]['number']
			} else {
				data['volume_count'] = series_books[series_books.length - 1]['number']
			}

			data['chapters'] = []
			data['volumes'] = []
		}
		
	}
	
	// Add the book UUIDs for later retrieval
	for (const book of series_books) {
		if (data['is_chapter_series']) {
			data['chapters'].push({'uuid': book['uuid']})
		} else {
			data['volumes'].push({'uuid': book['uuid']})
		}
	}

	return BookWalkerGlobalMangaBakaSeries.parse(data)
}*/

/*
export function worker_produce(worker: QueueClient) {
	//const log = Logger.label('ann_news_schedule_refresh')

	const options: TraceOptions & tracer.SpanOptions = {
		tags: {
			[tags.MANUAL_KEEP]: true,
			[tags.SPAN_KIND]: kinds.PRODUCER,
			[tags.SPAN_TYPE]: 'worker',
		},
	}

	return tracer.wrap('ann_news_schedule_refresh', options, async () => {
		const rows = await SourceAnimeNewsNetwork.scope('due_for_update').findAll()
		if (rows.length == 0) {
			log.debug('No AnimeNewsNetwork entries due for news refresh')

			return
		}

		for (const row of rows) {
			log.info('AnimeNewsNetwork', row.id, 'will be scheduled for news refresh')

			await update_last_scheduled_at(row)
			await worker.send(Queue.news_ann_work, { id: row.id })
		}
	})
}

export async function worker_consume_batch(jobs: RefreshSeriesNewsPayload) {
	const log = Logger.label('ann_refresh_news_batch')
	log.info('Processing', jobs.length, 'jobs concurrently')

	await Promise.allSettled(
		jobs.map(async (job) => {
			try {
				await worker_consume([job])
				await QueueClient.Worker.boss.complete(Queue.news_ann_work.name, job.id)
			} catch (err) {
				await QueueClient.Worker.boss.fail(Queue.news_ann_work.name, job.id, err as object)
			}
		}),
	)

	log.info('Done processing', jobs.length, 'jobs concurrently')
}

export async function worker_consume([job]: RefreshSeriesNewsPayload) {
	const log = Logger.label(`ann_refresh_news`)

	const options: TraceOptions & tracer.SpanOptions = {
		tags: {
			[tags.MANUAL_KEEP]: true,
			[tags.SPAN_KIND]: kinds.CONSUMER,
			[tags.SPAN_TYPE]: 'worker',
			series: job.data,
		},
	}

	await tracer.trace('ann_refresh_news', options, async () => {
		// ! Don't wrap in a big transaction, it can be incredible slow and failing one entry
		// ! would undo all of them

		const row = await SourceAnimeNewsNetwork.findByPk(job.data.id)
		if (!row) {
			log.warn('could not find AnimeNewsNetwork row with ID', job.data.id)
			return
		}

		log.info('Updating AnimeNewsNetwork entry [', row.id, ']')

		await refresh_news(row)
	})
}

function update_last_scheduled_at(row: SourceAnimeNewsNetwork) {
	row.last_scheduled_at = new Date()
	return row.save()
}

export async function worker_consume_discover_new_entries() {
	const log = Logger.label(`worker_consume_discover_new_entries`)

	const resp = await axios.get(`https://www.animenewsnetwork.com/encyclopedia/reports.xml?id=149`)
	const result = parser.toJson(resp.data, { object: true, coerce: true })
	const report = result.report as { item: any[] }

	for (const item of report.item as any[]) {
		const id = item.manga.href.split('?id=')[1]
		if (!id) {
			log.warn('Could not find ID for encyclopedia entry')
			continue
		}

		const [, created] = await SourceAnimeNewsNetwork.findOrCreate({
			where: { id },
		})

		if (created) {
			log.info('Discovered new ANN encyclopedia entry', id)
		}
	}
}
*/