import assert from 'node:assert/strict'
import {chromium} from 'playwright'

const site = 'chongqianli7/harbor-seal'
const target = (process.env.HARBOR_URL || 'https://chongqianli7.github.io/harbor-seal/') + '#site=' + encodeURIComponent(site)
const browser = await chromium.launch()
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({viewport:{width,height:900}, isMobile:width < 500, hasTouch:width < 500})
    await page.goto(target, {waitUntil:'domcontentloaded'})
    await page.getByText('Active seal', {exact:true}).waitFor({timeout:60000})
    assert.equal(await page.locator('#journal li').count(), 3)
    assert.equal(await page.getByRole('link', {name:'Finalized receipt'}).count(), 3)
    assert(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth))
    await page.getByRole('button', {name:'Create test wallet'}).click()
    const first = await page.locator('#wallets code').innerText()
    await page.getByRole('button', {name:'Create test wallet'}).click()
    const second = await page.locator('#wallets code').innerText()
    assert.notEqual(first, second)
    await page.getByText('Only the current steward or nominated successor', {exact:false}).waitFor()
    await page.reload()
    await page.getByText('Active seal', {exact:true}).waitFor()
    assert.equal(await page.getByLabel('Active test wallet').count(), 0)
    await page.close()
    console.log(`Verified public record, receipt links, wallet isolation and reload at ${width}px`)
  }
} finally {
  await browser.close()
}
