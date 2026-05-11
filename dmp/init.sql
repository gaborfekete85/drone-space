-- Video
INSERT INTO drone_space.videos (id,user_id,folder_path,filename,cover_filename,size_bytes,"location",latitude,longitude,height_m,tags,taken_at,drone_type,original_filename,uploaded_at,visibility,drone_id) VALUES
	 ('8af94ddf-b42f-479b-bed6-43320f7095d6'::uuid,'user_3DDgqxv7HBmwt3pFHt08hg1hqA5','2026/London','Elthorn_Dani_cine_3.mp4','Elthorn_Dani_cine_3_cover.jpg',4125128882,'London',NULL,NULL,NULL,'{}',NULL,'video','Elthorn_Dani_cine_3.mp4','2026-05-04 14:34:47.085978+02','private',NULL);
INSERT INTO drone_space.videos (id,user_id,folder_path,filename,cover_filename,size_bytes,"location",latitude,longitude,height_m,tags,taken_at,drone_type,original_filename,uploaded_at,visibility,drone_id) VALUES
	 ('385758eb-0e18-44fe-a86c-54ea0250f07b'::uuid,'user_3DDgqxv7HBmwt3pFHt08hg1hqA5','2026/Switzerland','slideshow_with_music2.mp4','slideshow_with_music2_cover.jpg',32672853,'Switzerland',NULL,NULL,NULL,'{}',NULL,'video','slideshow_with_music2.mp4','2026-05-04 04:20:12.841958+02','private',NULL);
INSERT INTO drone_space.videos (id,user_id,folder_path,filename,cover_filename,size_bytes,"location",latitude,longitude,height_m,tags,taken_at,drone_type,original_filename,uploaded_at,visibility,drone_id) VALUES
	 ('cd3c0529-2c79-4890-b111-668da832d389'::uuid,'user_3DFyN4VkgbOCx5K41wFbpliTdLX','2026/2026','430d3e28-c418-406e-8c4b-5d6aaa9bccb8.mp4','430d3e28-c418-406e-8c4b-5d6aaa9bccb8_cover.jpg',4265196,NULL,NULL,NULL,NULL,'{}',NULL,'video','430d3e28-c418-406e-8c4b-5d6aaa9bccb8.mp4','2026-05-06 14:09:48.487979+02','private','c8ad16a1-608c-4487-b0f8-0738991dca8d'::uuid);
INSERT INTO drone_space.videos (id,user_id,folder_path,filename,cover_filename,size_bytes,"location",latitude,longitude,height_m,tags,taken_at,drone_type,original_filename,uploaded_at,visibility,drone_id) VALUES
	 ('f4cefd4e-8739-43fd-a5e7-532cdecb44d0'::uuid,'user_3DJkMrIKIoa4bRry748QL4eWRNK','2026/Luca','430d3e28-c418-406e-8c4b-5d6aaa9bccb8.mp4','430d3e28-c418-406e-8c4b-5d6aaa9bccb8_cover.jpg',4265196,NULL,NULL,NULL,NULL,'{}',NULL,'video','430d3e28-c418-406e-8c4b-5d6aaa9bccb8.mp4','2026-05-06 14:22:49.250461+02','private','cce0532d-734a-48fb-ad37-0240733b29c6'::uuid);
INSERT INTO drone_space.videos (id,user_id,folder_path,filename,cover_filename,size_bytes,"location",latitude,longitude,height_m,tags,taken_at,drone_type,original_filename,uploaded_at,visibility,drone_id) VALUES
	 ('5befa795-fcd5-4c15-9ba2-ea3db2bf16c6'::uuid,'user_3DDgqxv7HBmwt3pFHt08hg1hqA5','2026','Elthorn_Dani_cine_3.mp4','Elthorn_Dani_cine_3_cover.jpg',4125128882,'London',NULL,NULL,NULL,'{}',NULL,'fpv','Elthorn_Dani_cine_3.mp4','2026-05-06 15:04:50.479712+02','private','45773079-6115-41eb-9884-822ba6403a86'::uuid);
INSERT INTO drone_space.videos (id,user_id,folder_path,filename,cover_filename,size_bytes,"location",latitude,longitude,height_m,tags,taken_at,drone_type,original_filename,uploaded_at,visibility,drone_id) VALUES
	 ('1ac01910-7899-4335-9d03-450eb4dc806a'::uuid,'user_3DIJr96pNBTgbTMGHWcvN52BDp9','','DJI_20250921131026_0007_D_stabilized.mp4',NULL,2746583180,'London, UK',NULL,NULL,NULL,'{Elthorne_Park}','2026-04-30 16:06:00+02','fpv','DJI_20250921131026_0007_D_stabilized.mp4','2026-05-06 15:53:15.964343+02','private','553e747a-b489-4dca-98dc-ed4e9f9917fd'::uuid);
INSERT INTO drone_space.videos (id,user_id,folder_path,filename,cover_filename,size_bytes,"location",latitude,longitude,height_m,tags,taken_at,drone_type,original_filename,uploaded_at,visibility,drone_id) VALUES
	 ('b941b642-869a-4a06-8fa0-13a3601adcbb'::uuid,'user_3DIJr96pNBTgbTMGHWcvN52BDp9','','probah264.mp4',NULL,831568552,'London, UK',NULL,NULL,NULL,'{proba}',NULL,'fpv','probah264.mp4','2026-05-06 16:25:06.191794+02','private','553e747a-b489-4dca-98dc-ed4e9f9917fd'::uuid);

-- Drones
INSERT INTO drone_space.drones (id,user_id,brand,model,nickname,max_flight_time_min,year_acquired,notes,photo_filename,created_at,updated_at,drone_type,status,sale_price,sale_currency,listed_at) VALUES
	 ('45773079-6115-41eb-9884-822ba6403a86'::uuid,'user_3DDgqxv7HBmwt3pFHt08hg1hqA5','DJI','Air 3',NULL,NULL,NULL,NULL,'45773079-6115-41eb-9884-822ba6403a86.jpg','2026-05-05 21:33:44.938632+02','2026-05-05 21:39:24.849547+02','fpv','SELLING',200.00,'EUR','2026-05-05 21:39:24.849547+02');
INSERT INTO drone_space.drones (id,user_id,brand,model,nickname,max_flight_time_min,year_acquired,notes,photo_filename,created_at,updated_at,drone_type,status,sale_price,sale_currency,listed_at) VALUES
	 ('553e747a-b489-4dca-98dc-ed4e9f9917fd'::uuid,'user_3DIJr96pNBTgbTMGHWcvN52BDp9','Lyma','BeetleO4','beetle',10,2025,'2.5 inch fpv frone with dji O4 pro','553e747a-b489-4dca-98dc-ed4e9f9917fd.jpg','2026-05-06 11:50:58.268565+02','2026-05-06 11:50:58.401129+02','fpv','OWNED',NULL,NULL,NULL);
INSERT INTO drone_space.drones (id,user_id,brand,model,nickname,max_flight_time_min,year_acquired,notes,photo_filename,created_at,updated_at,drone_type,status,sale_price,sale_currency,listed_at) VALUES
	 ('c8ad16a1-608c-4487-b0f8-0738991dca8d'::uuid,'user_3DFyN4VkgbOCx5K41wFbpliTdLX','DJI','air3',NULL,NULL,NULL,NULL,'c8ad16a1-608c-4487-b0f8-0738991dca8d.jpg','2026-05-06 14:09:20.182497+02','2026-05-06 14:09:20.305464+02','video','OWNED',NULL,NULL,NULL);
INSERT INTO drone_space.drones (id,user_id,brand,model,nickname,max_flight_time_min,year_acquired,notes,photo_filename,created_at,updated_at,drone_type,status,sale_price,sale_currency,listed_at) VALUES
	 ('cce0532d-734a-48fb-ad37-0240733b29c6'::uuid,'user_3DJkMrIKIoa4bRry748QL4eWRNK','DJI','Air3',NULL,NULL,NULL,NULL,'cce0532d-734a-48fb-ad37-0240733b29c6.jpg','2026-05-06 14:20:52.282889+02','2026-05-06 14:20:52.410377+02','video','OWNED',NULL,NULL,NULL);

-- Messages
INSERT INTO drone_space.messages (id,thread_id,sender_user_id,recipient_user_id,subject,body,created_at,read_at) VALUES
	 ('ef2e06be-29b2-45d3-8df2-aeebbb0534b4'::uuid,'ef2e06be-29b2-45d3-8df2-aeebbb0534b4'::uuid,'user_3DIJr96pNBTgbTMGHWcvN52BDp9','user_3DDgqxv7HBmwt3pFHt08hg1hqA5','Test','Test','2026-05-05 22:06:28.778211+02','2026-05-05 22:07:59.734558+02');
INSERT INTO drone_space.messages (id,thread_id,sender_user_id,recipient_user_id,subject,body,created_at,read_at) VALUES
	 ('ae0f6384-ec81-4d4f-a5c8-ea011d62e4cd'::uuid,'ef2e06be-29b2-45d3-8df2-aeebbb0534b4'::uuid,'user_3DDgqxv7HBmwt3pFHt08hg1hqA5','user_3DIJr96pNBTgbTMGHWcvN52BDp9','Re: Test','Akár péntek, akár szombat. Akár péntek, akár szombat. Nekem mindegy ez, csak gyere el majd holnap.','2026-05-05 22:08:31.283879+02','2026-05-05 22:08:53.11607+02');
INSERT INTO drone_space.messages (id,thread_id,sender_user_id,recipient_user_id,subject,body,created_at,read_at) VALUES
	 ('ea41916a-1d51-4774-841c-b29e8b89af47'::uuid,'ea41916a-1d51-4774-841c-b29e8b89af47'::uuid,'user_3DIJr96pNBTgbTMGHWcvN52BDp9','user_3DDgqxv7HBmwt3pFHt08hg1hqA5','Interested in your DJI Air 3','Ennyiert meg is vennem😉','2026-05-05 22:08:37.939157+02','2026-05-05 22:09:19.077233+02');
INSERT INTO drone_space.messages (id,thread_id,sender_user_id,recipient_user_id,subject,body,created_at,read_at) VALUES
	 ('d65a1d02-0369-4a4d-bfd5-1aac6c514b6b'::uuid,'d65a1d02-0369-4a4d-bfd5-1aac6c514b6b'::uuid,'user_3DDgqxv7HBmwt3pFHt08hg1hqA5','user_3DFyN4VkgbOCx5K41wFbpliTdLX','Hello','Teszt','2026-05-05 22:17:53.457414+02','2026-05-05 22:19:10.741797+02');
INSERT INTO drone_space.messages (id,thread_id,sender_user_id,recipient_user_id,subject,body,created_at,read_at) VALUES
	 ('d50f9678-8fed-4709-aa82-9daa1a26abc1'::uuid,'d65a1d02-0369-4a4d-bfd5-1aac6c514b6b'::uuid,'user_3DFyN4VkgbOCx5K41wFbpliTdLX','user_3DDgqxv7HBmwt3pFHt08hg1hqA5','Re: Hello','Hey','2026-05-05 22:19:30.834264+02','2026-05-05 22:19:40.979621+02');
INSERT INTO drone_space.messages (id,thread_id,sender_user_id,recipient_user_id,subject,body,created_at,read_at) VALUES
	 ('655e2247-e2fb-43d0-a11a-058f684cb667'::uuid,'ea41916a-1d51-4774-841c-b29e8b89af47'::uuid,'user_3DDgqxv7HBmwt3pFHt08hg1hqA5','user_3DIJr96pNBTgbTMGHWcvN52BDp9','Re: Interested in your DJI Air 3','Hat nem veletlen itt vannak a legjobb arak :D','2026-05-05 22:09:42.1161+02','2026-05-06 11:45:15.865639+02');
INSERT INTO drone_space.messages (id,thread_id,sender_user_id,recipient_user_id,subject,body,created_at,read_at) VALUES
	 ('72cba99c-7008-4619-a1de-64d1d3cc7940'::uuid,'ea41916a-1d51-4774-841c-b29e8b89af47'::uuid,'user_3DIJr96pNBTgbTMGHWcvN52BDp9','user_3DDgqxv7HBmwt3pFHt08hg1hqA5','Re: Interested in your DJI Air 3','desktopon mar meg tudtam nyitni','2026-05-06 11:46:08.073601+02','2026-05-06 14:03:13.293752+02');
INSERT INTO drone_space.messages (id,thread_id,sender_user_id,recipient_user_id,subject,body,created_at,read_at) VALUES
	 ('fe75f8e1-2d1c-47de-8954-cde83e83f422'::uuid,'ea41916a-1d51-4774-841c-b29e8b89af47'::uuid,'user_3DDgqxv7HBmwt3pFHt08hg1hqA5','user_3DIJr96pNBTgbTMGHWcvN52BDp9','Re: Interested in your DJI Air 3','Szuper','2026-05-06 14:03:22.30199+02','2026-05-06 16:09:59.012765+02');

-- User Profiles
INSERT INTO drone_space.user_profile (user_id,latitude,longitude,location_label,location_updated_at,created_at,updated_at,display_name,nickname,description,country,city,social_links,profile_image_filename) VALUES
	 ('user_3DFyN4VkgbOCx5K41wFbpliTdLX',47.4353461888056,8.346794648488501,'Killwangen, Switzerland','2026-05-06 14:08:11.583781+02','2026-05-05 21:51:40.58301+02','2026-05-06 14:08:11.583781+02',NULL,NULL,NULL,NULL,NULL,'{}',NULL);
INSERT INTO drone_space.user_profile (user_id,latitude,longitude,location_label,location_updated_at,created_at,updated_at,display_name,nickname,description,country,city,social_links,profile_image_filename) VALUES
	 ('user_3DJkMrIKIoa4bRry748QL4eWRNK',47.435332112376706,8.346817348986058,'Killwangen, Switzerland','2026-05-06 14:15:48.777442+02','2026-05-06 14:15:48.777442+02','2026-05-06 14:15:48.777442+02',NULL,NULL,NULL,NULL,NULL,'{}',NULL);
INSERT INTO drone_space.user_profile (user_id,latitude,longitude,location_label,location_updated_at,created_at,updated_at,display_name,nickname,description,country,city,social_links,profile_image_filename) VALUES
	 ('user_3DIJr96pNBTgbTMGHWcvN52BDp9',51.509246114779835,-0.32829560452416423,'Greater London, United Kingdom','2026-05-07 12:09:54.376533+02','2026-05-05 20:22:53.495403+02','2026-05-07 12:09:54.376533+02',NULL,NULL,NULL,NULL,NULL,'{}',NULL);
INSERT INTO drone_space.user_profile (user_id,latitude,longitude,location_label,location_updated_at,created_at,updated_at,display_name,nickname,description,country,city,social_links,profile_image_filename) VALUES
	 ('user_3DDgqxv7HBmwt3pFHt08hg1hqA5',47.43532450380048,8.34679980616869,'Killwangen, Switzerland','2026-05-07 14:18:02.342275+02','2026-05-05 18:56:31.371361+02','2026-05-07 14:18:02.342275+02','Gabor','Fekete','I am a drone addicted person','Switzerland','Killwangen','{"x": "https://x.com/fekete85_2", "tiktok": "https://www.tiktok.com/@gabor.fekete85", "website": "https://feketegabor.com", "youtube": "https://www.youtube.com/@gaborfekete85", "facebook": "https://www.facebook.com/fekete.gabor/", "linkedin": "https://www.linkedin.com/in/gabor-fekete-74623350/", "instagram": "https://www.instagram.com/fgabiweb/"}','profile.jpeg');

-- Video Shares
INSERT INTO drone_space.video_shares (id,video_id,shared_with_user_id,shared_by_user_id,created_at) VALUES
	 ('c659024c-78de-4212-abac-906eccdface1'::uuid,'8af94ddf-b42f-479b-bed6-43320f7095d6'::uuid,'user_3DFyVjbYplpp4Csp7QyEkFclFBC','user_3DDgqxv7HBmwt3pFHt08hg1hqA5','2026-05-04 14:38:58.252655+02');
INSERT INTO drone_space.video_shares (id,video_id,shared_with_user_id,shared_by_user_id,created_at) VALUES
	 ('8c6683cb-082b-4e1c-9c1c-4508cd942f50'::uuid,'8af94ddf-b42f-479b-bed6-43320f7095d6'::uuid,'user_3DFyN4VkgbOCx5K41wFbpliTdLX','user_3DDgqxv7HBmwt3pFHt08hg1hqA5','2026-05-04 14:39:26.008701+02');
INSERT INTO drone_space.video_shares (id,video_id,shared_with_user_id,shared_by_user_id,created_at) VALUES
	 ('3038e2a5-1405-4513-95f1-fd4caef2f177'::uuid,'8af94ddf-b42f-479b-bed6-43320f7095d6'::uuid,'user_3DIJr96pNBTgbTMGHWcvN52BDp9','user_3DDgqxv7HBmwt3pFHt08hg1hqA5','2026-05-05 17:30:02.19519+02');
INSERT INTO drone_space.video_shares (id,video_id,shared_with_user_id,shared_by_user_id,created_at) VALUES
	 ('ee5176f5-afe4-4a05-af49-fff1b29a69eb'::uuid,'f4cefd4e-8739-43fd-a5e7-532cdecb44d0'::uuid,'user_3DDgqxv7HBmwt3pFHt08hg1hqA5','user_3DJkMrIKIoa4bRry748QL4eWRNK','2026-05-06 14:23:25.045535+02');
INSERT INTO drone_space.video_shares (id,video_id,shared_with_user_id,shared_by_user_id,created_at) VALUES
	 ('88d4496f-af13-4817-8baa-4ac0848c38f0'::uuid,'f4cefd4e-8739-43fd-a5e7-532cdecb44d0'::uuid,'user_3DFyN4VkgbOCx5K41wFbpliTdLX','user_3DJkMrIKIoa4bRry748QL4eWRNK','2026-05-06 14:23:28.336376+02');
