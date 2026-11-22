enum Light:
  case Red, Green, Yellow

def next(l: Light): Light = l match
  case Light.Green  => Light.Yellow
  case Light.Yellow => Light.Red
  case Light.Red    => Light.Green
