# Service Listing Slug - Quick Reference Guide

## Table of Contents
1. [What is a Slug?](#what-is-a-slug)
2. [How Slugs are Generated](#how-slugs-are-generated)
3. [API Usage](#api-usage)
4. [Best Practices](#best-practices)
5. [Examples](#examples)

---

## What is a Slug?

A **slug** is a URL-friendly version of a string, typically used in web addresses. For service listings, slugs make URLs more readable and SEO-friendly.

**Example:**
- Title: "Advanced TypeScript & React Bootcamp"
- Slug: `advanced-typescript-react-bootcamp`
- URL: `/service-listings/slug/advanced-typescript-react-bootcamp`

---

## How Slugs are Generated

### Automatic Generation (Default)
If you don't provide a slug, it's automatically generated from the title:

```typescript
Title: "Python for Data Science"
→ Slug: "python-for-data-science"
```

### Manual Specification
You can optionally provide your own custom slug:

```json
{
  "title": "Python for Data Science",
  "slug": "data-science-python-2024",
  "description": "..."
}
```

### Slug Transformation Rules

| Input | Output |
|-------|--------|
| "Advanced TypeScript Course" | `advanced-typescript-course` |
| "John's Python & Django Class" | `johns-python-django-class` |
| "Full   Stack    Development" | `full-stack-development` |
| "Node.js / Express Basics" | `nodejs-express-basics` |
| "TOP 10 Programming Tips" | `top-10-programming-tips` |

### Duplicate Handling
If a slug already exists, a number is appended:

```
"Python Basics" → "python-basics"
"Python Basics" → "python-basics-1"
"Python Basics" → "python-basics-2"
```

---

## API Usage

### Create Service Listing

**Endpoint:** `POST /service-listings`

**Auto-generated slug:**
```bash
curl -X POST http://localhost:3000/service-listings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Mastering Docker Containers",
    "description": "Complete Docker course",
    "price": 79.99,
    "category": "technical"
  }'
```

**Custom slug:**
```bash
curl -X POST http://localhost:3000/service-listings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Mastering Docker Containers",
    "slug": "docker-mastery-2024",
    "description": "Complete Docker course",
    "price": 79.99,
    "category": "technical"
  }'
```

### Get Listing by Slug

**Endpoint:** `GET /service-listings/slug/:slug`

```bash
curl http://localhost:3000/service-listings/slug/mastering-docker-containers \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "mentorId": "mentor-uuid-here",
  "title": "Mastering Docker Containers",
  "slug": "mastering-docker-containers",
  "description": "Complete Docker course",
  "price": 79.99,
  "duration": 8,
  "category": "technical",
  "isActive": true,
  "isFeatured": false,
  "averageRating": 4.8,
  "reviewCount": 15,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-20T14:30:00Z"
}
```

### Update Service Listing

**Endpoint:** `PATCH /service-listings/:id`

**Update title (auto-updates slug):**
```bash
curl -X PATCH http://localhost:3000/service-listings/LISTING_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Docker Mastery: Complete Guide 2024"
  }'
```

**Update slug explicitly:**
```bash
curl -X PATCH http://localhost:3000/service-listings/LISTING_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "docker-complete-guide"
  }'
```

---

## Best Practices

### ✅ DO:
- Use descriptive, keyword-rich titles for better SEO
- Keep slugs concise but meaningful
- Use hyphens to separate words
- Include relevant keywords that users might search for
- Let the system auto-generate slugs (they're usually good)

### ❌ DON'T:
- Use special characters in slugs
- Create overly long slugs (>150 characters)
- Try to manually craft slugs with uppercase letters (they're auto-lowercased)
- Worry about duplicates (handled automatically)

### SEO Tips:
1. **Include primary keywords**: "react-typescript-course" ✓
2. **Keep it readable**: "advanced-react-patterns" ✓
3. **Avoid stop words**: Skip "the", "a", "an", etc.
4. **Use numbers when relevant**: "top-10-python-tips" ✓

---

## Examples

### Example 1: Creating Multiple Similar Listings

**Request 1:**
```json
{
  "title": "JavaScript Fundamentals",
  "description": "Learn JS basics",
  "price": 49.99,
  "category": "technical"
}
```
**Result:** `slug = "javascript-fundamentals"`

**Request 2:**
```json
{
  "title": "JavaScript Fundamentals",
  "description": "Another JS course",
  "price": 39.99,
  "category": "technical"
}
```
**Result:** `slug = "javascript-fundamentals-1"`

---

### Example 2: Special Characters Handling

**Input:**
```json
{
  "title": "C++ & C# Programming Masterclass",
  "description": "Learn both languages",
  "price": 89.99
}
```

**Generated slug:** `c-c-programming-masterclass`

*(Note: `&` and `+` are removed)*

---

### Example 3: Updating a Listing

**Original:**
```json
{
  "title": "React Basics",
  "slug": "react-basics"
}
```

**After title update:**
```json
{
  "title": "React Basics 2024 Edition"
}
```

**New slug:** `react-basics-2024-edition`

---

## Frontend Integration

### React Example

```typescript
// Navigate to listing by slug
function ListingCard({ listing }) {
  return (
    <Link to={`/service-listings/slug/${listing.slug}`}>
      <h3>{listing.title}</h3>
      <p>{listing.description}</p>
      <span>${listing.price}</span>
    </Link>
  );
}

// Fetch listing by slug
async function fetchListing(slug: string) {
  const response = await fetch(`/service-listings/slug/${slug}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  return data;
}
```

### Angular Example

```typescript
// Route definition
const routes = [
  { path: 'service-listings/slug/:slug', component: ListingDetailComponent }
];

// Component usage
constructor(private route: ActivatedRoute, private api: ApiService) {}

ngOnInit() {
  const slug = this.route.snapshot.paramMap.get('slug');
  this.api.getListingBySlug(slug).subscribe(listing => {
    this.listing = listing;
  });
}
```

---

## Troubleshooting

### Issue: Slug already exists error
**Solution:** The system automatically handles this by appending numbers. If you're seeing errors, ensure you're not explicitly setting duplicate slugs.

### Issue: Slug doesn't match title
**Solution:** This is expected behavior. Slugs are auto-generated on creation and only update if:
- You explicitly change the slug
- You change the title (slug regenerates)

### Issue: Special characters in slug
**Solution:** Special characters are intentionally removed for SEO compatibility. Use only letters, numbers, and spaces in titles.

---

## Database Schema

```sql
CREATE TABLE service_listings (
  id UUID PRIMARY KEY,
  mentorId UUID NOT NULL,
  title VARCHAR NOT NULL,
  slug VARCHAR(150) NOT NULL UNIQUE,  -- ← New field
  description TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  -- ... other fields
);

CREATE UNIQUE INDEX idx_service_listings_slug_lower 
ON service_listings(LOWER(slug));  -- Case-insensitive uniqueness
```

---

## Summary

✅ **Slugs are automatic**: Don't worry about creating them manually  
✅ **Slugs are unique**: Duplicates get numbered suffixes  
✅ **Slugs are SEO-friendly**: Lowercase, hyphenated, clean URLs  
✅ **Slugs are flexible**: Can be overridden or auto-generated  
✅ **Slugs are validated**: Only lowercase letters, numbers, and hyphens allowed  

For more details, see `SLUG_IMPLEMENTATION_SUMMARY.md`
