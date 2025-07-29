import { z } from 'zod'
import { fa } from 'zod/v4/locales'

function null_array<T extends z.ZodTypeAny>(schema: T) {
  return z.array(schema).transform((val) => (val.length === 0 ? null : val))
}

const genre = z.object({
	genre: z.string(),
	link: z.string().url().nullish(),
})

const price = z.object({
	value: z.number(),
	iso_code: z.string(), // ISO 4217
})

const staff = z.object({
	id: z.number().nullish(),
	role: z.string(),
	name: z.string().nullish(),
	link: z.string().url().nullish(),
})

export const book_series = z.object({
	series_slug: z.string(),
	series_title: z.string(),
	series_link: z.string().url().nullish(),
	series_type: z.enum(['manga', 'novel', 'light novel', 'art book']),
	distributor: z.string().nullish(),
	series_edition: z.string().nullish(),
})

const volume = z.object({
	slug: z.string(),
	url: z.string().url().nullish(),
	cover: z.string().url().nullish(),
	title: z.string().nullish(),
	staff: null_array(staff).nullish(),
	distributor: z.string().nullish(),
	genres: null_array(z.string()).nullish(),
	age_rating: z.enum(['All Ages', 'Teen', 'Ten Plus', 'Older Teen', 'Older Teen (15+)', 'Older Teen (17+)', 'For Readers 17+', 'Mature']).nullish(),
	edition: z.string().nullish(),
	description: z.string().nullish(),
	isbn: z.string().nullish(),
	number: z.string().nullish(),
	release_date: z.coerce.date().nullish(),
	digital_date: z.coerce.date().nullish(),
	price: price.nullish(),
	pages: z.number().nullish(),
})

export const SevenSeasMangaBakaSeries = z.object({
	series_slug: z.string(),
	series_title: z.string(),
	series_title_ja: z.string().nullish(),
	series_title_ja_en: z.string().nullish(),
	url: z.string().url().nullish(),
	type: z.enum(['manga', 'novel', 'light novel', 'art book']),
	volume_count: z.number().nullish(),
	cover: z.string().url().nullish(),
	thumbnail: z.string().url().nullish(),
	staff: null_array(staff).nullish(),
	distributor: z.string().nullish(),
	genres: null_array(genre).nullish(),
	age_rating: z.enum(['All Ages', 'Teen', 'Ten Plus', 'Older Teen', 'Older Teen (15+)', 'Older Teen (17+)', 'For Readers 17+', 'Mature']).nullish(),
	description: z.string().nullish(),
	volumes: null_array(volume).nullish(),
})

export type SevenSeasMangaBakaSeries = z.infer<typeof SevenSeasMangaBakaSeries>

export const SevenSeasMangaBakaBook = z.object({
	series: book_series,
	slug: z.string().nullish(),
	url: z.string().url().nullish(),
	title: z.string().nullish(),
	type: z.enum(['manga', 'novel', 'light novel', 'art book']),
	cover: z.string().url().nullish(),
	staff: null_array(staff).nullish(),
	distributor: z.string().nullish(),
	age_rating: z.string().nullish(),
	edition: z.string().nullish(),
	description: z.string().nullish(),
	isbn: z.string().nullish(),
	number: z.string().nullish(),
	release_date: z.coerce.date().nullish(),
	digital_date: z.coerce.date().nullish(),
	price: price.nullish(),
	pages: z.number().nullish(),
})

export type SevenSeasMangaBakaBook = z.infer<typeof SevenSeasMangaBakaBook>

export const SevenSeasManga = z
	.object({
		'id': z.number(),
		'gid': z.number(),
		'info': z.object({
			genres: z
				.array(
					z.object({
						$t: z.string(),
						gid: z.number(),
						type: z.string(),
					}),
				)
				.nullish(),

			picture: z
				.array(
					z.object({
						gid: z.number(),
						img: z.array(
							z.object({
								src: z.string(),
								width: z.number(),
								height: z.number(),
							}),
						),
						src: z.string(),
						type: z.string(),
						width: z.number().nullable(),
						height: z.number().nullable(),
					}),
				)
				.nullish(),

			official_website: z
				.array(
					z.object({
						$t: z.string(),
						gid: z.number(),
						href: z.string(),
						lang: z.string(),
						type: z.string(),
					}),
				)
				.nullish(),

			main_title: z
				.object({
					$t: z.coerce.string(),
					gid: z.number(),
					lang: z.string().nullable().default(null),
					type: z.string(),
				})
				.nullish(),

			plot_summary: z
				.object({
					$t: z.string(),
					gid: z.number().nullish(),
					type: z.string(),
				})
				.nullish(),

			number_of_pages: z
				.object({
					$t: z.number(),
					gid: z.number(),
					type: z.string(),
				})
				.nullish(),

			alternative_title: z
				.array(
					z.object({
						$t: z.coerce.string(),
						gid: z.number(),
						lang: z.string(),
						type: z.string(),
					}),
				)
				.nullish(),

			objectionable_content: z
				.object({
					$t: z.string(),
					gid: z.number().nullish(),
					type: z.string(),
				})
				.nullish(),
		}),

		'name': z.coerce.string(),
		'type': z.string(),

		'staff': z
			.array(
				z.object({
					gid: z.number(),
					task: z.array(z.string()),
					person: z.array(z.object({ $t: z.coerce.string(), id: z.number() })),
				}),
			)
			.nullish(),

		'credit': z
			.array(
				z.object({
					gid: z.number(),
					task: z.array(z.string()),
					company: z.array(z.object({ $t: z.string(), id: z.number() })),
				}),
			)
			.nullish(),

		'ratings': z
			.object({
				nb_votes: z.number(),
				weighted_score: z.number(),
			})
			.nullish(),
	})
	.strict()

export type SevenSeasManga = z.infer<typeof SevenSeasManga>

/*export const volumeSchema = z.object({
  id: z.number(),
  links: z.array(z.string().url()),
  cover: z.string().url().nullable(), // Changed .nullish() to .nullable() for consistency if it truly means 'can be null'
  title: z.string(),
  writer: z.string(),
  artist: z.string(),
  distributor: distributor, // Using the imported or defined distributor schema/type
  maturity_rating: z.string(),
  description: z.string(),
  isbn10: z.string(),
  isbn13: z.string(),
  sku: z.string(),
  type: z.string().nullable(),
  volume: z.string().nullable(), // Renamed from 'volume' to avoid conflict with the schema name
  date: z.coerce.date(),
  price: z.string().nullable(),
  pages: z.string().nullable(),
})*/
