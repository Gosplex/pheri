// All businesses are fictional. Gujarati/Hindi text is written natively, not transliterated gibberish.
// type drives what jobs a place can generate.

export const SHOPS = [
  { en: 'Shree Khodiyar Kirana Store', local: 'શ્રી ખોડિયાર કિરાણા સ્ટોર', type: 'grocery', bg: '#b3261e', accent: '#f4b400' },
  { en: 'Jalaram Sweets & Farsan', local: 'જલારામ સ્વીટ્સ એન્ડ ફરસાણ', type: 'sweets', bg: '#f4b400', fg: '#6b1010', accent: '#b3261e', style: 2 },
  { en: 'Mahavir Medical Store', local: 'મહાવીર મેડિકલ સ્ટોર', type: 'pharmacy', bg: '#0f7a4a', accent: '#ffffff' },
  { en: 'Krishna Mobile Point', local: 'કૃષ્ણ મોબાઇલ પોઇન્ટ', type: 'mobile', bg: '#1f4fa3', accent: '#ffd23f', style: 1 },
  { en: 'Bapa Sitaram Tea Stall', local: 'બાપા સીતારામ ચા', type: 'tea', bg: '#e8dcc0', fg: '#7a1f12', accent: '#c0392b', style: 2 },
  { en: 'Rajkot na Ganthiya', local: 'રાજકોટના ગાંઠિયા', type: 'farsan', bg: '#d35400', accent: '#fff3c4', style: 1 },
  { en: 'Navrang Xerox & Stationery', local: 'નવરંગ ઝેરોક્ષ', type: 'xerox', bg: '#ffffff', fg: '#1e2a5a', accent: '#e74c3c', style: 2 },
  { en: 'Sai Auto Garage', local: 'સાઈ ઓટો ગેરેજ', type: 'garage', bg: '#2c3e50', accent: '#f1c40f' },
  { en: 'Gokul Dairy Parlour', local: 'ગોકુલ ડેરી પાર્લર', type: 'grocery', bg: '#2e86de', accent: '#ffffff', style: 1 },
  { en: 'Ambika Khaman House', local: 'અંબિકા ખમણ હાઉસ', type: 'farsan', bg: '#f9e04b', fg: '#7b241c', accent: '#27ae60', style: 2 },
  { en: 'Shiv Hardware', local: 'શિવ હાર્ડવેર', type: 'hardware', bg: '#7f8c8d', accent: '#f39c12' },
  { en: 'Vidya Coaching Classes', local: 'વિદ્યા કોચિંગ ક્લાસીસ', type: 'coaching', bg: '#6c3483', accent: '#f5b041', style: 1 },
  { en: 'Jay Somnath Pan Centre', local: 'જય સોમનાથ પાન સેન્ટર', type: 'tea', bg: '#117a65', accent: '#f7dc6f' },
  { en: 'Chamunda Kathiyawadi Dhaba', local: 'ચામુંડા કાઠિયાવાડી ઢાબા', type: 'restaurant', bg: '#922b21', accent: '#f4d03f', style: 2 },
  { en: 'Ashapura Electricals', local: 'આશાપુરા ઈલેક્ટ્રિકલ્સ', type: 'electric', bg: '#1a5276', accent: '#f4d03f' },
  { en: 'Sagar Ice Cream', local: 'સાગર આઈસ્ક્રીમ', type: 'icecream', bg: '#f5b7b1', fg: '#78281f', accent: '#5dade2', style: 1 },
  { en: 'Dwarkesh Fruits', local: 'દ્વારકેશ ફ્રૂટ્સ', type: 'fruit', bg: '#27ae60', accent: '#f9e79f' },
  { en: 'Balaji Tyres', local: 'બાલાજી ટાયર્સ', type: 'garage', bg: '#1c2833', accent: '#e67e22', style: 1 },
  { en: 'Rajkot Dabeli Centre', local: 'રાજકોટ દાબેલી સેન્ટર', type: 'farsan', bg: '#c0392b', accent: '#fdebd0', style: 2 },
  { en: 'Umiya Cloth Emporium', local: 'ઉમિયા ક્લોથ એમ્પોરિયમ', type: 'cloth', bg: '#884ea0', accent: '#f8c471' },
  { en: 'Suvidha Kirana', local: 'सुविधा किराना', script: 'hi', type: 'grocery', bg: '#e67e22', accent: '#fff' },
  { en: 'Shubh Labh Traders', local: 'शुभ लाभ ट्रेडर्स', script: 'hi', type: 'hardware', bg: '#a93226', accent: '#f4d03f', style: 2 },
  { en: 'Annapurna Thali', local: 'અન્નપૂર્ણા થાળી', type: 'restaurant', bg: '#b9770e', accent: '#fff', style: 1 },
  { en: 'Fafda Jalebi Corner', local: 'ફાફડા જલેબી કોર્નર', type: 'sweets', bg: '#f39c12', fg: '#4a1a0a', accent: '#c0392b' },
  { en: 'Om Sai Photo Studio', local: 'ૐ સાઈ ફોટો સ્ટુડિયો', type: 'xerox', bg: '#212f3d', accent: '#e74c3c', style: 1 },
  { en: 'Mahalaxmi Jewellers', local: 'મહાલક્ષ્મી જ્વેલર્સ', type: 'cloth', bg: '#7d6608', fg: '#fff8dc', accent: '#fdebd0', style: 2 },
  { en: 'Sunrise Cafe', local: 'સનરાઇઝ કેફે', type: 'restaurant', bg: '#17202a', fg: '#f9e79f', accent: '#e67e22' },
  { en: 'Patidar Pharmacy', local: 'પાટીદાર ફાર્મસી', type: 'pharmacy', bg: '#16a085', accent: '#ffffff', style: 1 },
  { en: 'New India Book Depot', local: 'ન્યૂ ઈન્ડિયા બુક ડેપો', type: 'xerox', bg: '#1b4f72', accent: '#f5b041' },
  { en: 'Gurukrupa Paratha House', local: 'ગુરુકૃપા પરાઠા હાઉસ', type: 'restaurant', bg: '#a04000', accent: '#fae5d3', style: 2 },
  { en: 'Laxmi Vegetable Mart', local: 'લક્ષ્મી શાકભાજી', type: 'fruit', bg: '#1e8449', accent: '#f4d03f', style: 1 },
  { en: 'Star Computer Repair', local: 'સ્ટાર કોમ્પ્યુટર', type: 'mobile', bg: '#0b5345', accent: '#48c9b0' },
  { en: 'Bhagwati Kitchenware', local: 'ભગવતી વાસણ ભંડાર', type: 'hardware', bg: '#935116', accent: '#fad7a0' },
  { en: 'Rangoli Saree Centre', local: 'રંગોળી સાડી સેન્ટર', type: 'cloth', bg: '#c2185b', accent: '#ffe082', style: 1 },
  { en: 'Mitra Juice Centre', local: 'મિત્ર જ્યુસ સેન્ટર', type: 'icecream', bg: '#f1c40f', fg: '#145a32', accent: '#27ae60', style: 2 },
  { en: 'Khodal Tiffin Service', local: 'ખોડલ ટિફિન સર્વિસ', type: 'restaurant', bg: '#5b2c6f', accent: '#f7dc6f' },
];

export const SOCIETIES = [
  { en: 'Shivam Residency', local: 'શિવમ રેસીડેન્સી' },
  { en: 'Nilkanth Park', local: 'નીલકંઠ પાર્ક' },
  { en: 'Gokuldham Society', local: 'ગોકુલધામ સોસાયટી' },
  { en: 'Ambika Township', local: 'અંબિકા ટાઉનશિપ' },
  { en: 'Sardar Nagar', local: 'સરદાર નગર' },
  { en: 'Saurashtra Heights', local: 'સૌરાષ્ટ્ર હાઇટ્સ' },
  { en: 'Parijat Apartment', local: 'પારિજાત એપાર્ટમેન્ટ' },
  { en: 'Shreeji Complex', local: 'શ્રીજી કોમ્પ્લેક્સ' },
  { en: 'Om Shanti Flats', local: 'ૐ શાંતિ ફ્લેટ્સ' },
  { en: 'Krishna Kunj', local: 'કૃષ્ણ કુંજ' },
  { en: 'Radhe Krishna Society', local: 'રાધે કૃષ્ણ સોસાયટી' },
  { en: 'Anand Vihar', local: 'આનંદ વિહાર' },
];

export const HOARDINGS = [
  { title: 'Pheri — deliveries across Rajkot', sub: 'Ride with us. Earn every day.', local: 'ફેરી — રાજકોટમાં ડિલિવરી', bg: '#1e2a5a', accent: '#f4b400' },
  { title: 'Kathiyawadi Thali ₹150', sub: 'Unlimited rotla, ringan, chaas', local: 'કાઠિયાવાડી થાળી', bg: '#922b21', accent: '#f4d03f' },
  { title: 'Navratri Garba Nights', sub: 'Ring Road Grounds · Book passes', local: 'નવરાત્રી ગરબા મહોત્સવ', bg: '#6c3483', accent: '#f5b041' },
  { title: 'Admissions Open 2026', sub: 'Engineering · Pharmacy · Design', local: 'પ્રવેશ શરૂ', bg: '#0e6655', accent: '#fdfefe' },
  { title: 'Ride slow. Wear helmet.', sub: 'Rajkot City Traffic Awareness', local: 'હેલ્મેટ પહેરો, ધીમે ચલાવો', bg: '#1b2631', accent: '#e74c3c' },
  { title: 'Saurashtra Fuels', sub: 'Open 24 hours · Clean fuel', local: 'સૌરાષ્ટ્ર ફ્યુઅલ્સ', bg: '#0b5345', accent: '#f1c40f' },
  { title: 'Sparrow 110 — ₹69,990', sub: 'Mileage that means business', local: 'સ્પેરો ૧૧૦', bg: '#a93226', accent: '#fdebd0' },
  { title: 'Save water. Save Saurashtra.', sub: 'Every drop counts', local: 'પાણી બચાવો', bg: '#1f618d', accent: '#aed6f1' },
];

export const FIRST_NAMES = ['Hardik', 'Krupa', 'Dhruv', 'Riya', 'Jignesh', 'Pooja', 'Nirav', 'Hetal', 'Parth', 'Khushi', 'Yash', 'Bhavna', 'Mehul', 'Nidhi', 'Rakesh', 'Ishita', 'Chirag', 'Foram', 'Vishal', 'Janvi', 'Ravi', 'Tanvi', 'Karan', 'Disha', 'Imran', 'Ayesha', 'Harpreet', 'Anjali', 'Sagar', 'Mansi'];
export const SURNAMES = ['Patel', 'Shah', 'Mehta', 'Joshi', 'Vaghela', 'Parmar', 'Trivedi', 'Desai', 'Pandya', 'Dave', 'Rathod', 'Makwana', 'Solanki', 'Bhatt', 'Kotak', 'Sheikh', 'Gill', 'Rana'];

export const HOUSE_NAMES = ['Shree Krupa', 'Ashirwad', 'Gayatri', 'Om Villa', 'Maa Ashapura', 'Sai Darshan', 'Jalaram Krupa', 'Swagat', 'Shanti Sadan', 'Ramdev Krupa'];
