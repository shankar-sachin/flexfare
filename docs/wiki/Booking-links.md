# Booking links

flexfare doesn't sell tickets. Each route has a **Booking options** panel: the airline itself first (recommended), then Google Flights, Skyscanner, Expedia and Kayak.

Code: `src/shared/booking.ts` and `src/shared/airlines.ts`.

## Airlines with a pre-filled link

Alaska, United, American, JetBlue and Delta. Each format was opened in a real browser and checked. Delta fills in the form and you click Find Flights.

About 45 other airlines open their own site, and the panel prints the trip so you can enter it.

## The rule for adding one

**Never add a deep link you haven't opened in a browser.** A wrong link that looks right is worse than no link. When you open a pull request for a new airline, say how you checked it.
