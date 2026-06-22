"""
预设AI服务商数据 — 用户只需填API Key即可使用

功能：提供预设的AI服务商配置数据
输入参数：无
返回值：PRESET_AI_PROVIDERS 列表
使用场景：系统初始化时导入预设AI服务商
"""

PRESET_AI_PROVIDERS = [
    {
        "provider_name": "DeepSeek",
        "api_base": "https://api.deepseek.com",
        "api_key": "sk-cec40004d9a64ea9bb423342a3484171",
        "model_list": ["deepseek-v4-flash", "deepseek-v4-pro"],
        "is_enabled": True,
    },
    {
        "provider_name": "智谱",
        "api_base": "https://open.bigmodel.cn/api/paas/v4",
        "api_key": "02150d28804f47e8b234d24958dc069f.ZrQgdTY7sXzeDgDc",
        "model_list": ["GLM-4.7-Flash", "GLM-4.6V-Flash"],
        "is_enabled": True,
    },
    {
        "provider_name": "讯飞星辰",
        "api_base": "https://maas-coding-api.cn-huabei-1.xf-yun.com/v2",
        "api_key": "7fe3b2635de53021d94c8efecf35f338:YTYzNWE2MjMyNmQ0YzhkMWFjOGNlN2Fh",
        "model_list": ["astron-code-latest"],
        "is_enabled": False,
    },
    {
        "provider_name": "讯飞星火OCR",
        "api_base": "https://maas-coding-api.cn-huabei-1.xf-yun.com/v2",
        "api_key": "",
        "model_list": ["4.0Ultra"],
        "is_enabled": False,
    },
    {
        "provider_name": "硅基流动",
        "api_base": "https://api.siliconflow.cn/v1",
        "api_key": "",
        "model_list": [],
        "is_enabled": False,
    },
    {
        "provider_name": "火山大模型",
        "api_base": "https://ark.cn-beijing.volces.com/api/v3",
        "api_key": "",
        "model_list": [],
        "is_enabled": False,
    },
    {
        "provider_name": "Kimi",
        "api_base": "https://api.moonshot.cn/v1",
        "api_key": "",
        "model_list": ["moonshot-v1-8k"],
        "is_enabled": False,
    },
    {
        "provider_name": "Qwen",
        "api_base": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "api_key": "",
        "model_list": ["qwen-turbo"],
        "is_enabled": False,
    },
]
