# Channel applications: what Bookingbooster submits, and the answers to give

These are the forms only the company owner can submit. The software side is built and waits on each approval.

## 1. Google Vacation Rentals (free listings, guests book on the host's own site)

- **Where:** the Google Vacation Rentals interest form, linked from https://developers.google.com/hotels/vacation-rentals/dev-guide/onboarding
- **What Google asks for:** a named technical contact, a signed contract with Google to protect customer privacy, and localised self-service or email support for hosts. Google says the listing feed takes about 2 to 4 weeks to ingest.
- **Answers:**
  - Company: Bookingbooster Ltd, direct-booking websites for UK holiday lets. Every listing is an entire home with instant booking on the host's own site.
  - Technical contact: the person who will receive Hotel Center access.
  - Support: email support at the support address in `SUPPORT_EMAIL`, plus in-app help.
  - Listing feed: XML in Google's local feed format, zipped, fetched daily from `https://booking-booster.co.uk/feeds/google-vr/<key>/listings.zip`. The key is shown on the team page; it is an HMAC of the server secret.
  - Point of Sale file: `https://booking-booster.co.uk/feeds/google-vr/<key>/pos.xml`. The landing link opens the home's own site with the guest's dates and party size set.
  - Pricing: ARI (OTA_HotelRateAmountNotifRQ, OTA_HotelAvailNotifRQ, OTA_HotelInvCountNotifRQ). We start sending these once Google gives us the push endpoint.
- **After approval:** set `GOOGLE_VR_PARTNER` to the partner name Google assigns.
- **Note:** Google's docs recommend a connectivity provider for fewer than 5,000 properties. This is a recommendation, not a rule. If Google declines a direct connection, Channex can carry Google instead.

## 2. Channex (all channels, white label)

- **Sign up:** staging.channex.io, then create an API key and add it as the secret `CHANNEX_API_KEY`.
- **White label:** ask Channex support to switch on the White Label Domain setting, and to stop property booking emails going to hosts. Then point `channels.booking-booster.co.uk` at Channex as they instruct, and set `CHANNEX_FRAME_BASE=https://channels.booking-booster.co.uk`.
- **Certification:** run the PMS certification tests at https://docs.channex.io/api-v.1-documentation/pms-certification-tests.md on staging, and email the results to support@channex.io. Then open a production account and set `CHANNEX_BASE=https://app.channex.io`.
- **What hosts will still see:**
  - Booking.com and Expedia list the connection as "Channex.io" in their extranets. Hosts are told to choose it as "our connection partner".
  - Airbnb's approval screen may show Channex's app name.

## 3. Booking.com and Vrbo direct (later, optional)

Only worth applying for once there are enough homes to justify the certification work. Until then, Channex carries both.

- **Booking.com:** apply through the Connectivity Partner Programme at https://connectivity.booking.com/. A test property needs a machine account, which comes from your account manager once you are accepted.
- **Vrbo:** email vrboconnectivity@expediagroup.com.
- **Airbnb:** not accepting new API partners. Airbnb stays on Channex, with calendar links as the free fallback.
