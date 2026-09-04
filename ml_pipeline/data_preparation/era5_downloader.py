"""
ERA5 CDS API Downloader.

Downloads ERA5 reanalysis fields and GFS forecast data
for environmental feature extraction.
"""

import os
import logging
from pathlib import Path
from typing import List, Optional, Dict
from datetime import datetime

logger = logging.getLogger(__name__)


class ERA5Downloader:
    """
    ERA5 CDS API client for downloading reanalysis fields.
    
    Supports downloading single-level and pressure-level variables
    for specific times, areas, and computing climatological means.
    """

    # Standard variables for cyclone analysis
    SINGLE_LEVEL_VARS = [
        "sea_surface_temperature",
        "mean_sea_level_pressure",
    ]

    PRESSURE_LEVEL_VARS = [
        "u_component_of_wind",
        "v_component_of_wind",
        "relative_humidity",
        "vorticity",
        "divergence",
    ]

    PRESSURE_LEVELS = ["200", "500", "700", "850"]

    # NIO domain
    NIO_AREA = [30, 30, -5, 120]  # [N, W, S, E]

    def __init__(self, output_dir: str = "data/raw/era5"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._client = None

    def _get_client(self):
        """Lazy-initialize CDS API client."""
        if self._client is None:
            try:
                import cdsapi
                self._client = cdsapi.Client()
            except Exception as e:
                logger.error("CDS API client init failed: %s", e)
                logger.info("Set CDS API key: ~/.cdsapirc or CDSAPI_URL/CDSAPI_KEY env vars")
                raise
        return self._client

    def download_snapshot(
        self,
        dt: datetime,
        variables: Optional[List[str]] = None,
        area: Optional[List[float]] = None,
        output_file: Optional[str] = None,
    ) -> str:
        """
        Download ERA5 fields for a specific date/time.
        
        Args:
            dt: Target datetime
            variables: List of ERA5 variable names (defaults to standard set)
            area: [N, W, S, E] bounding box (defaults to NIO)
            output_file: Output filename (auto-generated if None)
        Returns:
            Path to downloaded NetCDF file
        """
        if variables is None:
            variables = self.SINGLE_LEVEL_VARS

        if area is None:
            area = self.NIO_AREA

        if output_file is None:
            output_file = str(self.output_dir / f"era5_{dt.strftime('%Y%m%d_%H')}.nc")

        if os.path.exists(output_file):
            logger.info("Using cached ERA5: %s", output_file)
            return output_file

        client = self._get_client()

        request = {
            "product_type": "reanalysis",
            "format": "netcdf",
            "variable": variables,
            "year": str(dt.year),
            "month": f"{dt.month:02d}",
            "day": f"{dt.day:02d}",
            "time": f"{dt.hour:02d}:00",
            "area": area,
        }

        logger.info("Downloading ERA5 for %s (%d variables)", dt.isoformat(), len(variables))
        try:
            client.retrieve("reanalysis-era5-single-levels", request, output_file)
            logger.info("Saved ERA5 to %s", output_file)
        except Exception as e:
            logger.error("ERA5 download failed: %s", e)
            raise

        return output_file

    def download_pressure_levels(
        self,
        dt: datetime,
        variables: Optional[List[str]] = None,
        levels: Optional[List[str]] = None,
        area: Optional[List[float]] = None,
        output_file: Optional[str] = None,
    ) -> str:
        """
        Download ERA5 pressure level fields.
        
        Args:
            dt: Target datetime
            variables: Pressure level variables
            levels: Pressure levels in hPa
            area: Bounding box
            output_file: Output path
        Returns:
            Path to downloaded NetCDF file
        """
        if variables is None:
            variables = self.PRESSURE_LEVEL_VARS
        if levels is None:
            levels = self.PRESSURE_LEVELS
        if area is None:
            area = self.NIO_AREA

        if output_file is None:
            output_file = str(
                self.output_dir / f"era5_pl_{dt.strftime('%Y%m%d_%H')}.nc"
            )

        if os.path.exists(output_file):
            logger.info("Using cached ERA5 PL: %s", output_file)
            return output_file

        client = self._get_client()

        request = {
            "product_type": "reanalysis",
            "format": "netcdf",
            "variable": variables,
            "pressure_level": levels,
            "year": str(dt.year),
            "month": f"{dt.month:02d}",
            "day": f"{dt.day:02d}",
            "time": f"{dt.hour:02d}:00",
            "area": area,
        }

        logger.info("Downloading ERA5 PL for %s", dt.isoformat())
        try:
            client.retrieve("reanalysis-era5-pressure-levels", request, output_file)
        except Exception as e:
            logger.error("ERA5 PL download failed: %s", e)
            raise

        return output_file

    def download_climatology(
        self,
        variable: str,
        months: List[int],
        area: Optional[List[float]] = None,
        years: tuple = (1991, 2020),
    ) -> str:
        """
        Download monthly climatological means.
        
        Args:
            variable: ERA5 variable name
            months: Months to download (1-12)
            area: Bounding box
            years: Year range for climatology
        Returns:
            Path to downloaded file
        """
        if area is None:
            area = self.NIO_AREA

        output_file = str(
            self.output_dir / f"era5_clim_{variable}_{years[0]}_{years[1]}.nc"
        )

        if os.path.exists(output_file):
            return output_file

        client = self._get_client()

        request = {
            "product_type": "monthly_averaged_reanalysis",
            "format": "netcdf",
            "variable": variable,
            "year": [str(y) for y in range(years[0], years[1] + 1)],
            "month": [f"{m:02d}" for m in months],
            "time": "00:00",
            "area": area,
        }

        logger.info("Downloading ERA5 climatology for %s", variable)
        try:
            client.retrieve(
                "reanalysis-era5-single-levels-monthly-means",
                request,
                output_file,
            )
        except Exception as e:
            logger.error("Climatology download failed: %s", e)
            raise

        return output_file


def download_gfs_forecast(
    init_time: datetime,
    lead_hours: List[int] = None,
    area: Optional[List[float]] = None,
    output_dir: str = "data/raw/gfs",
) -> Dict[int, str]:
    """
    Download GFS forecast fields from NCEP NOMADS.
    
    Args:
        init_time: GFS initialization time (00, 06, 12, 18 UTC)
        lead_hours: Forecast lead times [24, 48]
        area: Bounding box [N, W, S, E]
        output_dir: Output directory
    Returns:
        Dict mapping lead_hours → file path
    """
    if lead_hours is None:
        lead_hours = [24, 48]
    if area is None:
        area = [30, 30, -5, 120]  # NIO

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    results = {}

    for lead in lead_hours:
        output_file = str(
            output_path / f"gfs_{init_time.strftime('%Y%m%d_%H')}_f{lead:03d}.grib2"
        )

        if os.path.exists(output_file):
            results[lead] = output_file
            continue

        # NCEP NOMADS URL
        cycle = f"{init_time.hour:02d}"
        date_str = init_time.strftime("%Y%m%d")
        url = (
            f"https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl?"
            f"dir=%2Fgfs.{date_str}%2F{cycle}%2Fatmos&"
            f"file=gfs.t{cycle}z.pgrb2.0p25.f{lead:03d}&"
            f"lev_200_mb=on&lev_500_mb=on&lev_700_mb=on&lev_850_mb=on&"
            f"var_UGRD=on&var_VGRD=on&var_RH=on&var_ABSV=on&"
            f"subregion=&toplat={area[0]}&leftlon={area[1]}&rightlon={area[3]}&bottomlat={area[2]}"
        )

        try:
            import urllib.request
            logger.info("Downloading GFS f%03d from NOMADS", lead)
            urllib.request.urlretrieve(url, output_file)
            results[lead] = output_file
        except Exception as e:
            logger.warning("GFS download failed for f%03d: %s", lead, e)

    return results
