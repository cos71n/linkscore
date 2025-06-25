# Fixing YouTube Embed Issues with Cloudflare

## Problem Description
After implementing Cloudflare security updates, YouTube embeds on the results page started showing "Video unavailable - Watch on YouTube" error. This is caused by Cloudflare's security features interfering with YouTube's embed validation.

## Solution Overview
The fix involves two parts:
1. **Code Fix**: Add proper referrer policy meta tag (already implemented)
2. **Cloudflare Configuration**: Adjust security settings for the results page

## Part 1: Code Fix (Complete)
Added the following meta tag to `src/app/layout.tsx`:
```html
<meta name="referrer" content="no-referrer-when-downgrade" />
```

This ensures YouTube receives the referrer information it needs to validate embeds.

## Part 2: Cloudflare Configuration Steps

### Option A: Page Rules (Recommended for Pro Plan)

1. **Log in to Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com
   - Select your domain (linkscore.theseoshow.co)

2. **Navigate to Page Rules**
   - In the left sidebar, click on "Rules" → "Page Rules"

3. **Create New Page Rule**
   - Click "Create Page Rule"
   - URL pattern: `*linkscore.theseoshow.co/results/*`
   
4. **Configure Settings**
   Add these settings to the rule:
   - **Security Level**: Set to "Essentially Off"
   - **Browser Integrity Check**: OFF
   - **Disable Performance**: OFF (keep performance features)
   - **Rocket Loader**: OFF (can interfere with iframes)
   - **Auto Minify**: Uncheck JavaScript (can break embeds)

5. **Save and Deploy**
   - Click "Save and Deploy"
   - Changes take effect immediately

### Option B: Transform Rules (Alternative)

1. **Navigate to Rules → Transform Rules**
2. **Create Response Header Modification Rule**
   - Name: "YouTube Embed Fix"
   - When incoming requests match: `URI Path contains "/results/"`
   - Then: Remove security headers that block iframes
   - Remove headers:
     - `X-Frame-Options`
     - Modify `Content-Security-Policy` to allow YouTube

### Option C: Configuration Rules (If Available)

1. **Navigate to Rules → Configuration Rules**
2. **Create New Rule**
   - Name: "Results Page YouTube Fix"
   - Field: URI Path
   - Operator: contains
   - Value: `/results/`
3. **Set Configuration**
   - Rocket Loader: OFF
   - Mirage: OFF
   - Polish: OFF
   - Security Level: Low

## Testing the Fix

1. **Clear Cloudflare Cache**
   - Go to Caching → Configuration
   - Click "Purge Everything" or purge specific URLs

2. **Test in Multiple Browsers**
   - Visit a results page: https://linkscore.theseoshow.co/results/[id]
   - Verify YouTube video loads properly
   - Check browser console for any errors

3. **Test with Different Locations**
   - Use VPN to test from different countries
   - Ensure video works globally

## Troubleshooting

### If Video Still Doesn't Work:

1. **Check Browser Console**
   - Look for CSP (Content Security Policy) errors
   - Check for X-Frame-Options errors

2. **Verify Referrer Policy**
   - In browser DevTools → Network tab
   - Find YouTube embed request
   - Check "Referer" header is present

3. **Additional Cloudflare Settings to Check**
   - **Scrape Shield**: Ensure Hotlink Protection isn't blocking YouTube
   - **Security → WAF**: Check if any custom rules block iframes
   - **Speed → Optimization**: Disable Rocket Loader globally if needed

4. **Alternative Referrer Policies to Try**
   If `no-referrer-when-downgrade` doesn't work:
   - `unsafe-url` (sends full referrer always)
   - `strict-origin-when-cross-origin` (more restrictive)
   - `origin` (only sends domain, not full path)

## Security Considerations

While these changes reduce security slightly for the results pages:
- They only affect `/results/*` pages, not the entire site
- Form pages and API endpoints remain fully protected
- The referrer policy change is minimal and standard practice

## Monitoring

After implementation:
1. Monitor for any security alerts in Cloudflare
2. Check Analytics for unusual traffic patterns
3. Verify other embeds/features still work correctly

## Rollback Plan

If issues arise:
1. Delete the Page Rule in Cloudflare
2. Remove the meta tag from layout.tsx
3. Clear Cloudflare cache
4. Document any errors for further investigation

## Additional Resources

- [Cloudflare Page Rules Documentation](https://developers.cloudflare.com/support/page-rules/)
- [YouTube Embed Troubleshooting](https://support.google.com/youtube/answer/171780)
- [MDN Referrer Policy Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy) 