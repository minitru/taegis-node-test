const fs = require('fs');
const ini = require('ini');
const os = require('os');
const path = require('path');

const getConfigFile = () => {
    const configDir = path.join(os.homedir(), '.taegis_sdk_python');
    const configFilePath = path.join(configDir, 'config');
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { mode: 0o755 });
    }
    if (!fs.existsSync(configFilePath)) {
        fs.closeSync(fs.openSync(configFilePath, 'w', 0o600));
    }
    return configFilePath;
};

const getConfig = () => {
    const configFilePath = getConfigFile();
    const configContent = fs.readFileSync(configFilePath, 'utf-8');
    return ini.parse(configContent);
};

const writeConfig = (config) => {
    const configFilePath = getConfigFile();
    const configContent = ini.stringify(config);
    fs.writeFileSync(configFilePath, configContent);
};

const writeToConfig = (section, key, value) => {
    const config = getConfig();
    if (!config[section]) {
        config[section] = {};
    }
    config[section][key] = value;
    writeConfig(config);
};

module.exports = {
    getConfigFile,
    getConfig,
    writeConfig,
    writeToConfig
};