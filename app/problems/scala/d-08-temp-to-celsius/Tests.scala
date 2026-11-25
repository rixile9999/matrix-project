@main def tests(): Unit =
  Judge.check("섭씨 그대로")(toCelsius(Temp(21, 'C')), Some(21))
  Judge.check("화씨 212")(toCelsius(Temp(212, 'F')), Some(100))
  Judge.check("화씨 32")(toCelsius(Temp(32, 'F')), Some(0))
  Judge.check("화씨 영하")(toCelsius(Temp(14, 'F')), Some(-10))
  Judge.check("켈빈은 없음")(toCelsius(Temp(300, 'K')), None)
  Judge.check("섭씨 0")(toCelsius(Temp(0, 'C')), Some(0))
