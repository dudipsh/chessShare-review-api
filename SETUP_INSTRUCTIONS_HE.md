# הוראות הקמת שרת ניתוח משחקים - Railway

## סיכום מהיר

| פרט | ערך |
|-----|-----|
| פלטפורמה | Railway (Hobby Plan) |
| עלות | $5/חודש (כולל שימוש בסיסי) |
| זמן הקמה | ~10 דקות |
| מה מקבלים | 8 vCPU, 8GB RAM |

---

## שלב 1: Push לגיטהאב

פתח טרמינל והרץ:

```bash
cd /Users/dudipartush/dev/newChessGame/chessShare-review-api
git add .
git commit -m "Ready for Railway deployment"
git push origin master
```

---

## שלב 2: הרשמה ל-Railway

1. לך ל: **https://railway.app**
2. לחץ **"Login"** → **"Login with GitHub"**
3. אשר גישה לחשבון GitHub שלך

---

## שלב 3: רכישת Hobby Plan

1. לחץ על האייקון שלך (פינה ימנית עליונה)
2. לחץ **"Account Settings"** → **"Billing"**
3. בחר **"Hobby Plan"** - $5/חודש
4. הזן פרטי כרטיס אשראי
5. לחץ **"Subscribe to Hobby Plan"**

---

## שלב 4: יצירת פרויקט חדש

1. לחץ **"New Project"** (כפתור סגול)
2. בחר **"Deploy from GitHub repo"**
3. חפש: `chessShare-review-api`
4. לחץ על הריפו לבחירה
5. Railway יתחיל build אוטומטי (יכשל כי חסרים משתנים - זה בסדר!)

---

## שלב 5: הגדרת משתני סביבה (הכי חשוב!)

1. לחץ על השרת (הקוביה הסגולה) בתוך הפרויקט
2. לחץ על לשונית **"Variables"**
3. לחץ **"+ New Variable"** עבור כל אחד מהמשתנים הבאים:

### משתנים להעתקה (אחד-אחד):

**משתנה 1:**
```
NODE_ENV=production
```

**משתנה 2:**
```
PORT=3001
```

**משתנה 3:** (העתק מ-Supabase)
```
SUPABASE_URL=https://xxxxxxxxxx.supabase.co
```

**משתנה 4:** (העתק מ-Supabase - חשוב: service_role key!)
```
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**משתנה 5:**
```
STOCKFISH_PATH=/usr/games/stockfish
```

**משתנה 6:**
```
STOCKFISH_POOL_SIZE=4
```

**משתנה 7:**
```
STOCKFISH_DEPTH=18
```

**משתנה 8:**
```
STOCKFISH_TIMEOUT=10000
```

**משתנה 9:** (לסביבת בדיקות)
```
ALLOWED_ORIGINS=http://localhost:8080,https://chess-share-khaki.vercel.app
```

**משתנה 10:**
```
RATE_LIMIT_FREE_DAILY=3
```

**משתנה 11:**
```
RATE_LIMIT_PRO_DAILY=50
```

### איפה למצוא את פרטי Supabase:

1. לך ל: **https://supabase.com/dashboard**
2. בחר את הפרויקט שלך
3. לחץ **Settings** (גלגל שיניים) → **API**
4. העתק:
   - **Project URL** → לתוך `SUPABASE_URL`
   - **service_role** (תחת "Project API keys", לא anon!) → לתוך `SUPABASE_SERVICE_KEY`

⚠️ **שים לב:** להשתמש ב-**service_role** key, לא ב-anon key!

---

## שלב 6: הפעלת Build מחדש

אחרי שהוספת את כל המשתנים:

1. לחץ על לשונית **"Deployments"**
2. לחץ על שלוש הנקודות (...) ליד ה-deployment האחרון
3. לחץ **"Redeploy"**
4. המתן 2-3 דקות ל-build

---

## שלב 7: יצירת כתובת URL

1. לחץ על השרת
2. לחץ על לשונית **"Settings"**
3. גלול למטה ל-**"Networking"**
4. לחץ **"Generate Domain"**
5. תקבל כתובת כמו: `chessshare-review-api-production-xxxx.up.railway.app`

**שמור את הכתובת הזו!** תצטרך אותה בשלב הבא.

---

## שלב 8: בדיקה שהשרת עובד

פתח את הכתובת בדפדפן (או curl):

```
https://YOUR-RAILWAY-URL/api/v1/health
```

תצפה לראות:
```json
{
  "status": "healthy",
  "stockfish": "ready",
  "activeAnalyses": 0,
  "poolSize": 4,
  "uptime": 123
}
```

אם אתה רואה את זה - **מזל טוב! השרת עובד!** 🎉

---

## שלב 9: עדכון הפרונטאנד

### לפיתוח מקומי:

ערוך את הקובץ `.env` ב-chessy-linker:
```
VITE_REVIEW_API_URL=https://YOUR-RAILWAY-URL
```

### ל-Vercel (פרודקשיין):

1. לך ל: **https://vercel.com/dashboard**
2. בחר את פרויקט `chess-share-khaki`
3. לחץ **"Settings"** → **"Environment Variables"**
4. הוסף משתנה חדש:
   - **Key:** `VITE_REVIEW_API_URL`
   - **Value:** `https://YOUR-RAILWAY-URL`
5. לחץ **"Save"**
6. לחץ **"Deployments"** → **"Redeploy"** על ה-deployment האחרון

---

## פתרון בעיות נפוצות

### Build נכשל
- ודא שעשית `git push` לגיטהאב
- בדוק שכל המשתנים הוגדרו נכון
- בדוק לוגים ב-Railway

### CORS Error בדפדפן
- ודא ש-`ALLOWED_ORIGINS` כולל את הכתובת של הפרונטאנד
- אין סלאש בסוף הכתובות
- בדוק שאין שגיאות הקלדה

### Health check נכשל
- המתן עד דקה אחרי deploy
- ודא שה-PORT הוא 3001
- בדוק לוגים ב-Railway

### Stockfish לא נמצא
- ודא שה-Dockerfile נבחר (לא Nixpacks)
- בדוק ש-`STOCKFISH_PATH=/usr/games/stockfish`

---

## מאוחר יותר: יצירת שרת פרודקשיין

כשתהיה מוכן לצאת לפרודקשיין:

1. צור פרויקט Railway חדש (חזור על שלבים 4-8)
2. שנה את `ALLOWED_ORIGINS` ל:
   ```
   https://www.chessshare.com,https://chessshare.com
   ```
3. עדכן את Vercel עם ה-URL החדש

---

## עלויות צפויות

| שימוש | עלות חודשית |
|-------|-------------|
| בדיקות (עד 100 ניתוחים/יום) | ~$5-8 |
| פרודקשיין קטן | ~$10-15 |
| פרודקשיין בינוני | ~$15-25 |

ה-Hobby Plan כולל $5 שימוש, אז אם תישאר מתחת - תשלם רק $5.

---

## צ'קליסט

- [ ] עשיתי git push לגיטהאב
- [ ] נרשמתי ל-Railway Hobby Plan
- [ ] יצרתי פרויקט מ-GitHub repo
- [ ] הגדרתי את כל 11 המשתנים
- [ ] יצרתי Domain
- [ ] Health check עובד
- [ ] עדכנתי את הפרונטאנד עם ה-URL החדש
- [ ] בדקתי ניתוח משחק מקצה לקצה
