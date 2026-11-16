Pod::Spec.new do |s|
  s.name = 'BetweenUsProtection'
  s.version = '1.0.0'
  s.summary = 'Fixed private local vault backup protection for Between Us.'
  s.description = s.summary
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Between Us'
  s.homepage = 'https://github.com/oxieg3n/Between-us'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/oxieg3n/Between-us.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
