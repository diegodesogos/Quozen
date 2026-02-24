# API Live testing script

This script relies on the CLI app to be logged in to get a valid Google token.

### **How to use it:**

1. In **Terminal 1**, start your Hono API server locally:  
   Bash  
   npm run dev:api  
2. In **Terminal 2**, make sure you are logged in via the CLI (if you haven't recently):  
   Bash  
   npm run cli \-- login  
3. Run your new live tester script:  
   Bash  
   npm run test:live \--workspace=@quozen/api  

The script will securely read your valid Google token, trigger real requests against your locally running API server, output the API responses directly to the console, and ultimately print out the raw Bearer Token so you can easily copy-paste it into the Swagger UI (`http://localhost:8787/api/docs`) for manual testing

