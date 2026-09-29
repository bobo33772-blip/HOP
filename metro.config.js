// Metro 설정: 네이티브 빌드 폴더(android/, ios/)는 감시하지 않는다.
// 개발 빌드 결과물(수만 개 파일)을 감시하느라 Metro가 멈추는 문제를 막는다.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 경로 구분자(/ 또는 \)와 정규식 특수문자를 안전하게 바꾼다
const toPattern = (p) => p.replace(/[.*+?^${}()|[\]]/g, '\\$&').replace(/[\\/]/g, '[\\\\/]');
const nativeDirs = ['android', 'ios'].map((d) => new RegExp(`^${toPattern(path.join(__dirname, d))}[\\\\/].*`));

const existing = config.resolver.blockList;
config.resolver.blockList = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), ...nativeDirs];

module.exports = config;
