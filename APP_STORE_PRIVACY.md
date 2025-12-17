# App Store Privacy & Data Safety Information

Use this document when filling out Apple App Store Privacy Details and Google Play Data Safety forms.

## Data Collected

### 1. Contact Info
- **Email Address** - Required for account creation and login
- **Purpose**: Account authentication, password reset, magic link login
- **Linked to Identity**: Yes

### 2. User Content
- **Photos/Videos** - User-uploaded profile photos and post media
- **Purpose**: App functionality (profiles, posts, live streaming)
- **Linked to Identity**: Yes

- **Other User Content** - Posts, comments, chat messages
- **Purpose**: App functionality
- **Linked to Identity**: Yes

### 3. Identifiers
- **User ID** - Internal database identifier
- **Purpose**: App functionality
- **Linked to Identity**: Yes

### 4. Usage Data
- **Product Interaction** - Pages viewed, features used
- **Purpose**: Analytics, improving the app
- **Linked to Identity**: No (aggregated)

### 5. Financial Info (if gifting enabled)
- **Payment Info** - Processed by Stripe (not stored by us)
- **Purpose**: In-app purchases/gifts
- **Linked to Identity**: Yes (transaction records)

## Data NOT Collected
- Precise Location
- Coarse Location
- Physical Address
- Phone Number
- Health & Fitness Data
- Contacts
- Browsing History
- Search History
- Sensitive Info
- Advertising Data

## Third-Party Services
- **Supabase** - Database and authentication
- **Stripe** - Payment processing (if enabled)
- **Agora** - Live streaming infrastructure

## Data Retention
- Account data retained until user requests deletion
- Users can delete their account from Settings > Delete Account
- Deleted accounts are permanently removed within 30 days

## Data Sharing
- We do not sell user data
- Data shared only with service providers necessary for app operation
- No data shared for advertising purposes

## Security
- All data transmitted over HTTPS/TLS
- Passwords hashed (never stored in plain text)
- Database access restricted by row-level security policies

---

## Apple App Store Connect - Privacy Nutrition Labels

When asked "Does your app collect data?": **Yes**

Categories to select:
1. **Contact Info** > Email Address
   - Used for: App Functionality
   - Linked to User: Yes
   - Used for Tracking: No

2. **User Content** > Photos or Videos
   - Used for: App Functionality
   - Linked to User: Yes
   - Used for Tracking: No

3. **User Content** > Other User Content
   - Used for: App Functionality
   - Linked to User: Yes
   - Used for Tracking: No

4. **Identifiers** > User ID
   - Used for: App Functionality
   - Linked to User: Yes
   - Used for Tracking: No

5. **Usage Data** > Product Interaction (optional)
   - Used for: Analytics
   - Linked to User: No
   - Used for Tracking: No

---

## Google Play Data Safety Form

**Does your app collect or share any of the required user data types?**: Yes

**Is all of the user data collected by your app encrypted in transit?**: Yes

**Do you provide a way for users to request that their data is deleted?**: Yes

Data types to declare:
- Email address (Account management)
- User IDs (Account management)
- Photos and videos (App functionality)
- Other user-generated content (App functionality)

Optional:
- App interactions (Analytics)
- Purchase history (if gifting enabled)

---

## Support URLs for App Stores

- **Privacy Policy**: https://cannafam.com/privacy
- **Terms of Service**: https://cannafam.com/terms
- **Support/Contact**: https://cannafamapp.com/contact
- **Support Email**: support@cannafamapp.com
