@main def tests(): Unit =
  Judge.check("소수 한 자리")(label("사과", 1200.5), "사과: 1200.50원")
  Judge.check("0")(label("배", 0.0), "배: 0.00원")
  Judge.check("정수값")(label("감", 10.0), "감: 10.00원")
  Judge.check("세 자리 이상은 반올림")(label("귤", 3.14159), "귤: 3.14원")
