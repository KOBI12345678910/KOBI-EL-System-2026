# DEPLOY TO GOOGLE CLOUD — הוראות ל-Claude in Chrome

שלח את ההוראות הבאות ל-Claude in Chrome:

---

תפתח את Google Cloud Shell בכתובת: https://shell.cloud.google.com

כשנפתח, תריץ את הפקודות הבאות אחת אחרי השנייה:

## פקודה 1 — הגדר פרויקט
```
gcloud config set project onyx-system-493009
```

## פקודה 2 — הפעל Firestore
```
gcloud firestore databases create --location=eur3
```

## פקודה 3 — הפעל APIs
```
gcloud services enable run.googleapis.com cloudbuild.googleapis.com firestore.googleapis.com
```

## פקודה 4 — צור תיקייה
```
mkdir -p ~/onyx && cd ~/onyx
```

## פקודה 5 — צור את הקבצים
(צריך ליצור 4 קבצים: server-gcloud.js, seed-firestore.js, package-gcloud.json, Dockerfile)
את התוכן של כל קובץ אפשר להעתיק מהקבצים שהורדת.

## פקודה 6 — התקן והזן נתונים
```
cd ~/onyx
cp package-gcloud.json package.json
npm install
node seed-firestore.js
```

## פקודה 7 — דפלוי ל-Cloud Run
```
gcloud run deploy onyx-api \
  --source . \
  --region europe-west1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --min-instances 0 \
  --max-instances 3
```

## פקודה 8 — בדיקה
הכתובת שתקבל תיראה כמו:
https://onyx-api-XXXXX-ew.a.run.app

תפתח בדפדפן:
https://onyx-api-XXXXX-ew.a.run.app/api/status

צריך לראות:
```json
{"engine":"ONYX Procurement","status":"operational","database":"Firestore"}
```

🎉 המערכת חיה!
