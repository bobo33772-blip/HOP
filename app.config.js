// app.json 위에 얹는 설정.
// google-services.json(파이어베이스 푸시 설정)은 저장소에 올리지 않는다.
// 파일이 있을 때만(또는 EAS 파일 환경변수 GOOGLE_SERVICES_JSON이 있을 때만) 연결해서,
// 파일이 없는 팀원도 개발 빌드를 만들 수 있게 한다. 파일이 없으면 원격 푸시 알림만 빠진다.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const local = fs.existsSync(path.join(__dirname, 'google-services.json')) ? './google-services.json' : undefined;
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? local;
  if (!googleServicesFile) return config;
  return { ...config, android: { ...config.android, googleServicesFile } };
};
