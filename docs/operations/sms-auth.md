# OneShowSEO 手机验证码注册与登录

手机注册与登录使用阿里云短信服务 `SendSms`（API `2017-05-25`），当前只接受中国大陆 `+86` 手机号。注册页用于创建新手机号账号，登录页只允许已注册手机号登录；邮箱密码登录和邮箱注册继续保留。

## 服务端配置

```dotenv
SMS_AUTH_ENABLED=true
ALIYUN_SMS_ACCESS_KEY_ID=
ALIYUN_SMS_ACCESS_KEY_SECRET=
ALIYUN_SMS_SIGN_NAME=
ALIYUN_SMS_TEMPLATE_CODE=
ALIYUN_SMS_ENDPOINT=https://dysmsapi.aliyuncs.com/
ALIYUN_SMS_REGION_ID=cn-qingdao
SMS_CODE_TTL_SECONDS=300
SMS_PHONE_HASH_KEY=
```

`ALIYUN_SMS_TEMPLATE_CODE` 对应审核通过的验证码模板，模板变量必须叫 `code`。AccessKey 应来自只允许 `dysms:SendSms` 的 RAM 用户。`SMS_PHONE_HASH_KEY` 应为至少 32 字节的稳定随机值，上线后不得随意更换。所有密钥只放在服务器环境中，不写入 Git。

验证码 5 分钟有效且只能使用一次；同一手机号 60 秒内不可重复发送，每小时最多 5 条、每天最多 10 条，每个验证码最多尝试 5 次。数据库只保存手机号不可逆摘要、末四位，以及带随机盐的验证码摘要。

手机注册验证会创建独立的 14 天试用账户和工作空间；未注册手机号不能从登录页隐式建号，已注册手机号也不能重复注册。已有邮箱账户不会自动与手机号账户合并，账号合并必须通过后续经过重新认证的绑定流程完成。
