# Deploying

flexfare runs on the free tiers of Vercel and Firebase.

1. **Firebase:** create a project, enable Email/Password (with Email link) and Google sign-in, create Firestore, and add your domains under Authentication, Settings, Authorized domains.
2. **Firestore rules:** paste `firestore.rules` (deny all) into the console.
3. **Vercel:** import the GitHub repo and add every variable from [Environment variables](Environment-variables). Mark the secret ones as sensitive.
4. **Deploy.** Every pull request gets a preview deployment, and `main` goes to production.

## Custom domain

Add the domain in Vercel under Domains and follow its DNS instructions. Then add it to Firebase's authorized domains and update the sender in Brevo.
