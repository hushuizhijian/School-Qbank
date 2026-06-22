"""
日志工具

功能：提供统一的日志记录功能
输入参数：模块名称（用于日志标识）
返回值：logging.Logger 实例
使用场景：所有模块需要记录日志时使用此工具
"""
import logging
import sys


def get_logger(name: str, level: int = logging.INFO) -> logging.Logger:
    """
    获取日志记录器

    Args:
        name: 模块名称（建议使用 __name__）
        level: 日志级别，默认 INFO

    Returns:
        logging.Logger 实例
    """
    logger = logging.getLogger(name)  # 获取 logger 实例

    # 避免重复添加 handler
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)  # 输出到标准输出

        # 日志格式：[时间] [级别] [模块] 消息
        formatter = logging.Formatter(
            "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    logger.setLevel(level)  # 设置日志级别
    return logger