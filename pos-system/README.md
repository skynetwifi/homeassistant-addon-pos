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
3. ตั้งค่าการเชื่อมต่อ MariaDB
4. เริ่มต้น Add-on

## Database Setup

```sql
CREATE DATABASE pos_db;
CREATE USER 'code9'@'%' IDENTIFIED BY 'cdma1987';
GRANT ALL PRIVILEGES ON pos_db.* TO 'code9'@'%';
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
| db_user | Database User | code9 |
| db_password | Database Password | cdma1987 |
