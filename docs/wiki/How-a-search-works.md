# How a search works

1. **Pick** a trip type (round trip, one way, or multi-city), cities, and weeks on the month-by-month calendar. Weeks run Monday to Sunday and can be up to 26 weeks ahead.
2. **Gate.** You must be signed in, have a phone number on file (not verified) and a verified email.
3. **Quota.** One Firestore transaction checks your daily limit, the per-IP limit and the global limit. A repeat of the same search within 6 hours is cached and free.
4. **Fares.** The fare provider prices the best-fitting days inside your weeks. A city expands to all its airports, so San Francisco means SFO, OAK and SJC.
5. **Scoring.** `scoring.ts` computes every comparison in code: price, travel time, connections, how well the stay fits.
6. **AI.** Groq ranks the top candidates and writes the explanations. The model never supplies numbers. Its answer is rejected if it names an unknown flight, reuses a badge, invents a dollar amount, or calls a flight nonstop when it has stops.
7. **Fallback.** If the AI fails twice, you get a deterministic ranking. That result isn't cached and doesn't use up one of your searches.
8. **Results.** The AI writes up the top picks. The rest of the priced flights follow as "more options" with templated text.

Badges and warnings are computed from the data, never taken from the model.

## Deep Search

Each account gets 1 Deep Search a day (a larger model, more candidates, fuller trade-off explanations) and 4 regular searches.
