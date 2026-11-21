// Câu hỏi luật giao thông giữa đường chạy của Gian 3 (dùng chung cho mô phỏng ở máy chủ và giao diện).
// Mỗi câu: sign (mã biển báo để giao diện tự vẽ, null nếu không có hình), q (câu hỏi), a (đáp án, a[0] là đáp án đúng),
// tip (lời giải thích hiện khi trả lời sai và ở cuối lượt).
// NỘI DUNG MẪU: cần Cảnh sát giao thông / công an phường duyệt trước khi chạy thật.
// Đổi danh sách này thì các lượt đang chơi dở có thể chấm lệch: chỉ đổi khi cập nhật phiên bản.
export const QUIZ = [
  { sign: "P102", q: "Biển này nghĩa là gì?", a: ["Cấm đi ngược chiều", "Đường cụt", "Cấm dừng xe"], tip: "Biển P.102 tròn đỏ có vạch trắng ngang: cấm các loại xe đi vào theo chiều đặt biển." },
  { sign: "P101", q: "Biển này nghĩa là gì?", a: ["Đường cấm", "Hết đường cấm", "Đường ưu tiên"], tip: "Biển P.101 viền đỏ nền trắng: đường cấm mọi loại xe đi lại cả hai hướng, trừ xe được ưu tiên." },
  { sign: "P111", q: "Biển này cấm loại xe nào?", a: ["Xe máy", "Xe đạp", "Ô tô"], tip: "Biển cấm có hình xe máy: xe máy không được đi vào đoạn đường này." },
  { sign: "P127", q: "Biển này nghĩa là gì?", a: ["Tối đa 40 km/h", "Tối thiểu 40 km/h", "Cách 40 mét"], tip: "Biển tròn viền đỏ có số: tốc độ tối đa cho phép, không được chạy nhanh hơn số ghi trên biển." },
  { sign: "P121", q: "Biển này nghĩa là gì?", a: ["Cấm bấm còi", "Cấm loa đài", "Cấm xe máy"], tip: "Biển P.121: cấm sử dụng còi, thường đặt gần bệnh viện, trường học." },
  { sign: "P130", q: "Biển này nghĩa là gì?", a: ["Cấm dừng và đỗ xe", "Cấm đỗ xe", "Nơi đỗ xe"], tip: "Nền xanh, viền đỏ, gạch chéo hình chữ X: cấm cả dừng xe lẫn đỗ xe." },
  { sign: "P131", q: "Biển này nghĩa là gì?", a: ["Cấm đỗ xe", "Cấm dừng và đỗ xe", "Hết cấm đỗ"], tip: "Nền xanh, viền đỏ, một gạch chéo: cấm đỗ xe nhưng vẫn được dừng xe chốc lát." },
  { sign: "STOP", q: "Gặp biển này phải làm gì?", a: ["Dừng hẳn lại", "Đi chậm lại", "Bấm còi rồi đi"], tip: "Biển R.122 \"STOP\": mọi xe phải dừng lại, quan sát an toàn rồi mới được đi tiếp." },
  { sign: "W224", q: "Biển này báo hiệu gì?", a: ["Người đi bộ qua đường", "Đường đi bộ", "Cấm người đi bộ"], tip: "Biển W.224 tam giác vàng: sắp tới chỗ người đi bộ cắt ngang, giảm tốc và nhường đường." },
  { sign: "W225", q: "Biển này báo hiệu gì?", a: ["Gần trường học, trẻ em", "Công viên", "Khu dân cư"], tip: "Biển W.225: khu vực có trẻ em qua lại (trường học, nhà trẻ), phải đi chậm và chú ý." },
  { sign: "R303", q: "Biển này nghĩa là gì?", a: ["Vòng xuyến", "Được quay đầu", "Đường vòng tránh"], tip: "Biển R.303: nơi giao nhau chạy theo vòng xuyến, đi vòng theo chiều mũi tên." },
  { sign: "I407", q: "Biển này nghĩa là gì?", a: ["Đường một chiều", "Đi thẳng", "Đường ưu tiên"], tip: "Biển I.407 vuông xanh mũi tên trắng: đường một chiều, chỉ được đi theo chiều mũi tên." },
  { sign: null, q: "Đội mũ bảo hiểm thế nào là đúng?", a: ["Cài quai chắc chắn", "Đội, không cài quai", "Treo ở tay lái"], tip: "Mũ bảo hiểm chỉ bảo vệ được đầu khi đội đúng cỡ và cài quai chắc chắn." },
  { sign: null, q: "Đã uống rượu bia thì sao?", a: ["Không lái xe", "Lái thật chậm", "Uống ít vẫn lái"], tip: "Luật cấm tuyệt đối lái xe khi trong người có nồng độ cồn, dù chỉ uống một chút." },
  { sign: null, q: "Đèn vàng bật thì phải làm gì?", a: ["Dừng trước vạch", "Tăng tốc qua", "Bấm còi rồi qua"], tip: "Đèn vàng: phải dừng trước vạch dừng; chỉ đi tiếp nếu đã đi quá vạch dừng." },
  { sign: null, q: "Đủ mấy tuổi được lái xe gắn máy (dưới 50 cm³)?", a: ["16 tuổi", "14 tuổi", "12 tuổi"], tip: "Người đủ 16 tuổi trở lên mới được điều khiển xe gắn máy (dưới 50 cm³)." },
  { sign: null, q: "Bằng lái xe máy hạng A1 cấp cho người đủ mấy tuổi?", a: ["18 tuổi", "16 tuổi", "15 tuổi"], tip: "Phải đủ 18 tuổi mới được thi và cấp giấy phép lái xe hạng A1." },
  { sign: null, q: "Gặp tai nạn cần cấp cứu, gọi số nào?", a: ["115", "113", "114"], tip: "115 cấp cứu y tế, 113 công an, 114 cứu hỏa và cứu nạn cứu hộ." },
  { sign: null, q: "Người đi bộ nên sang đường ở đâu?", a: ["Vạch kẻ đường", "Giữa ngã tư", "Chỗ nào cũng được"], tip: "Người đi bộ sang đường ở nơi có vạch kẻ đường hoặc đèn tín hiệu, quan sát xe trước khi đi." },
  { sign: null, q: "Thông thường xe máy được chở thêm mấy người?", a: ["1 người", "2 người", "3 người"], tip: "Xe máy chỉ chở thêm 1 người; chở tối đa 2 người khi chở người bệnh đi cấp cứu, trẻ em dưới 12 tuổi, người già yếu hoặc người khuyết tật." },
  { sign: null, q: "Ở Việt Nam, xe đi về phía nào?", a: ["Bên phải", "Bên trái", "Giữa đường"], tip: "Xe đi bên phải theo chiều đi của mình, đúng làn đường được phép." },
  { sign: null, q: "Muốn vượt xe phía trước thì vượt bên nào?", a: ["Bên trái", "Bên phải", "Bên nào cũng được"], tip: "Vượt xe về bên trái, có báo hiệu và chỉ vượt khi đủ an toàn." },
  { sign: null, q: "Đang lái xe có được dùng điện thoại?", a: ["Không được", "Nghe nhanh thì được", "Nhắn tin thì được"], tip: "Không dùng điện thoại khi đang lái xe; muốn nghe gọi hãy dừng xe vào nơi an toàn." }
];
