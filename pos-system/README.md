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
CREATE USER 'pos_user'@'%' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON pos_db.* TO 'pos_user'@'%';
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
