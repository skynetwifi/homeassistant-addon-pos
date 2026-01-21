# Home Assistant POS System Add-on

ระบบ Point of Sale (POS) สำหรับ Home Assistant

## Features

- 🔐 ระบบล็อกอิน (Admin/Cashier)
- 📦 จัดการสินค้า (เพิ่ม/แก้ไข/ลบ)
- 📷 สแกนบาร์โค้ดด้วยกล้อง
- 💵 หน้าขายสินค้าพร้อมตะกร้า
- 📊 Dashboard สรุปยอดขาย
- 💰 คำนวณราคาขายจากต้นทุน + กำไร%

## Requirements

- MariaDB Add-on (ติดตั้งและเปิดใช้งาน)
- สร้าง Database `pos_db` และ User

## Installation

1. เพิ่ม Repository: `https://github.com/skynetwifi/homeassistant-addon-pos`
2. ติดตั้ง POS System Add-on
3. ไปที่แท็บ **Configuration** เพื่อตั้งค่า:
   - การเชื่อมต่อ MariaDB (Host, User, Password)
   - กำหนดข้อมูลเข้าสู่ระบบของผู้ดูแลระบบ (**Admin User** และ **Password**)
4. เริ่มต้น Add-on

## Database Setup

```sql
CREATE DATABASE pos_db;
CREATE USER 'pos_user' 'password';
GRANT ALL PRIVILEGES ON pos_db.* TO 'pos_user';
FLUSH PRIVILEGES;
```

## Default Accounts

- **Admin:** admin / admin123
- **Cashier:** cashier / cashier123

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| db_host | MariaDB Host | core-mariadb.local.hass.io |
| db_port | MariaDB Port | 3306 |
| db_name | Database Name | pos_db |
| db_user | Database User | pos_user |
| db_password | Database Password | password |
| admin_user | Admin Username (for login) | admin |
| admin_password | Admin Password | admin123 |

## How to Show on Lovelace Dashboard

You can add the POS interface to your Home Assistant dashboard using the **Webpage Card**.

### Method 1: Using Direct Port (Recommended for Tablets)
1. Go to Add-on **Configuration** -> **Network**.
2. Set port `8099` (or your choice).
3. Restart the Add-on.
4. In Lovelace, add a **Webpage Card**.
5. Set **URL** to: `http://<YOUR_HA_IP>:8099/cashier.html`
   - Example: `http://192.168.1.50:8099/cashier.html`

### Method 2: Using Ingress Path
1. Open the POS Add-on Web UI.
2. Copy the URL path (everything after the domain).
   - Example: `/api/hassio_ingress/a6f60c51_pos_system/`
3. In Lovelace, add a **Webpage Card**.
4. Set **URL** to the path you copied.

