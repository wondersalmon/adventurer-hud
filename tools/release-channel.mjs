/** Stable updates follow latest; prereleases stay on their exact release assets. */
export function releaseAssetUrls(repository, version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error("Invalid release version.");
  const release = `${repository.replace(/\/$/, "")}/releases/download/v${version}`;
  return {
    manifest: version.includes("-")
      ? `${release}/module.json`
      : `${repository.replace(/\/$/, "")}/releases/latest/download/module.json`,
    download: `${release}/adventurer-hud.zip`
  };
}
