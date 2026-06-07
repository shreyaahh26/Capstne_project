import logging
import sys
from datetime import datetime
from typing import Any

# ANSI Color Codes for terminal format
COLOR_RESET = "\033[0m"
COLOR_CYAN = "\033[36m"
COLOR_GREEN = "\033[32m"
COLOR_YELLOW = "\033[33m"
COLOR_RED = "\033[31m"
COLOR_MAGENTA = "\033[35m"
COLOR_BOLD = "\033[1m"

class EnterpriseConsoleFormatter(logging.Formatter):
    """
    Standardized Log Formatter outputting colored level headers and high-contrast labels.
    """
    def format(self, record: logging.LogRecord) -> str:
        # Save original level name
        orig_levelname = record.levelname
        
        # Colorize level names
        if record.levelno == logging.INFO:
            record.levelname = f"{COLOR_GREEN}{orig_levelname:<7}{COLOR_RESET}"
        elif record.levelno == logging.WARNING:
            record.levelname = f"{COLOR_YELLOW}{orig_levelname:<7}{COLOR_RESET}"
        elif record.levelno == logging.ERROR or record.levelno == logging.CRITICAL:
            record.levelname = f"{COLOR_RED}{orig_levelname:<7}{COLOR_RESET}"
        elif record.levelno == logging.DEBUG:
            record.levelname = f"{COLOR_CYAN}{orig_levelname:<7}{COLOR_RESET}"
            
        # Format Timestamp as clean ISO-8601 UTC
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        record.asctime = f"{COLOR_MAGENTA}{timestamp}{COLOR_RESET}"

        # Build message and format
        log_message = super().format(record)
        
        # Restore original level name just in case
        record.levelname = orig_levelname
        return log_message

def configure_logging(level: int = logging.INFO) -> None:
    """
    Sets up system log outputs across active Uvicorn and custom FastAPI threads.
    """
    logger = logging.getLogger()
    logger.setLevel(level)
    
    # Empty handlers list to avoid duplicating logs
    logger.handlers = []

    # Stream Handler outputting directly to stdout
    handler = logging.StreamHandler(sys.stdout)
    log_format = "%(asctime)s [%(levelname)s] [DRA-SYSTEM] [%(name)s]: %(message)s"
    formatter = EnterpriseConsoleFormatter(log_format)
    handler.setFormatter(formatter)
    
    logger.addHandler(handler)
    
    # Silence third-party network noise slightly
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    
    logging.info("Core enterprise logger validated successfully.")
