# Getting dishantmodh.com to rank (the parts only you can do)

The site now has the technical SEO in place (unique titles/descriptions, canonical URLs, schema.org Person/Article/Breadcrumb data,
sitemap, RSS feed, llms.txt, fast static pages, real article pages). Nobody can *guarantee* position #1, but
ranking #1 for your own name ("Dishant Modh") is very achievable. The steps below are what move the needle.

## 1. Do these this week (30 minutes)
1. **Google Search Console** -> add `https://dishantmodh.com` (Domain property) -> verify via DNS TXT at your registrar.
2. In Search Console: **Sitemaps -> submit `sitemap.xml`**, then **URL Inspection -> Request indexing** for `/`, `/experience.html`,
   `/resume.html` and each `/blog/*.html` article.
3. **Bing Webmaster Tools**: import the site from Search Console (one click). Covers Bing, DuckDuckGo and several AI assistants.
4. GitHub repo **Settings -> Pages**: confirm custom domain is `dishantmodh.com` and **Enforce HTTPS** is on.
   Also make sure `www.dishantmodh.com` redirects to the bare domain (or vice versa), not both indexed.

## 2. Backlinks and identity (this is the biggest ranking factor for a name search)
- **LinkedIn**: put `https://dishantmodh.com` in Contact info *and* the headline/About. Add the site under "Featured".
- **GitHub profile + repos**: set the Website field on your profile and on the `dhmodh.github.io` repo; add it to your profile README.
- Add the link to: Twitter/X bio, Stack Overflow / dev.to / Medium / Hashnode profiles, conference or meetup speaker pages, company
  engineering pages if allowed.
- **Publish and cross-post**: post each article on LinkedIn (link back) and submit to relevant communities (r/PostgreSQL, r/devops,
  Hacker News, Lobsters, dev.to with canonical URL pointing to your site).
- Use the **same name spelling everywhere**: "Dishant Modh".

## 3. Keep publishing
Google rewards sites that are updated. One solid article a month (new files in `blog/`, add to `blog.html`, `sitemap.xml`, `feed.xml`).
Good topics: pg_upgrade vs logical replication, pgbouncer sizing, RDS vs Aurora cost, Terraform for RDS, incident post-mortem template.

## 4. Employer note
Your site now names The Walt Disney Company. Check Disney's social-media / outside-activity / blogging policy before publishing
anything that could be read as speaking for the company, and keep confidential details out of articles.

## 5. Verify it worked
- Search `site:dishantmodh.com` in Google. Pages should appear within days to a few weeks of requesting indexing.
- Test rich results: https://search.google.com/test/rich-results (paste any page URL).
- Check speed: https://pagespeed.web.dev/
